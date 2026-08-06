import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import {
  PlayCircle, ChevronRight, CheckCircle2, Clock, AlertCircle,
  XCircle, Plus, ArrowLeft, Zap, DollarSign, Users, MoreHorizontal,
  Edit2, RefreshCw, X, Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type RunItem = {
  id: number; contractorId: number; contractorName: string;
  appointmentCount: number; serviceRevenue: string; tips: string;
  grossAmount: string; totalDeductions: string; netAmount: string;
  payoutMethod: string; status: string;
  deductions: Array<{ name: string; amount: string; type: string }> | null;
  contractor?: { id: number; firstName: string; lastName: string; payoutMethod: string; stripeAccountId: string | null; onboardingStatus: string };
};

type PayoutRun = {
  id: number; storeId: number; periodStart: string; periodEnd: string;
  status: string; totalGross: string; totalDeductions: string; totalNet: string;
  contractorCount: number; notes: string | null; createdAt: string;
  items: RunItem[];
};

type Contractor = {
  id: number; firstName: string; lastName: string; isActive: boolean;
  commissionRate: string; payoutMethod: string; onboardingStatus: string;
};

const STATUS_BADGE: Record<string, string> = {
  draft:      "bg-gray-100 text-gray-600",
  pending:    "bg-amber-50 text-amber-700",
  processing: "bg-blue-50 text-blue-700",
  completed:  "bg-emerald-50 text-emerald-700",
  failed:     "bg-red-50 text-red-700",
  cancelled:  "bg-gray-100 text-gray-400",
  paid:       "bg-emerald-50 text-emerald-700",
  skipped:    "bg-gray-50 text-gray-400",
};

function fmt$(n: string | number) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  try { return format(new Date(d + "T00:00:00"), "MMM d, yyyy"); } catch { return d; }
}

const PERIOD_PRESETS = [
  { label: "This Month", fn: () => {
    const n = new Date();
    return { from: format(startOfMonth(n), "yyyy-MM-dd"), to: format(endOfMonth(n), "yyyy-MM-dd") };
  }},
  { label: "Last Month", fn: () => {
    const n = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    return { from: format(startOfMonth(n), "yyyy-MM-dd"), to: format(endOfMonth(n), "yyyy-MM-dd") };
  }},
  { label: "Last 7 Days", fn: () => {
    const n = new Date();
    return { from: format(subDays(n, 7), "yyyy-MM-dd"), to: format(n, "yyyy-MM-dd") };
  }},
  { label: "Last 14 Days", fn: () => {
    const n = new Date();
    return { from: format(subDays(n, 14), "yyyy-MM-dd"), to: format(n, "yyyy-MM-dd") };
  }},
];

export default function PayoutsRun() {
  const { selectedStore } = useSelectedStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState<"list" | "create" | "review">("list");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(
    searchParams.get("runId") ? parseInt(searchParams.get("runId")!) : null
  );
  const [approveOpen, setApproveOpen] = useState(false);

  // Create form state
  const [periodFrom, setPeriodFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [periodTo, setPeriodTo]     = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [notes, setNotes]           = useState("");
  const [selectedContractors, setSelectedContractors] = useState<number[]>([]);
  const [allSelected, setAllSelected] = useState(true);

  // Fetch runs list
  const { data: runs = [], isLoading: runsLoading } = useQuery<PayoutRun[]>({
    queryKey: ["/api/contractor-payouts/runs", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/runs?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  // Fetch single run when reviewing
  const { data: runDetail } = useQuery<PayoutRun>({
    queryKey: ["/api/contractor-payouts/run-detail", selectedRunId],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/runs/${selectedRunId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedRunId,
  });

  // Fetch contractors for create step
  const { data: contractors = [] } = useQuery<Contractor[]>({
    queryKey: ["/api/contractor-payouts/contractors", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/contractors?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedStore?.id && step === "create",
  });

  const activeContractors = contractors.filter(c => c.isActive);

  const createRun = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/contractor-payouts/runs", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStore!.id,
          periodStart: periodFrom,
          periodEnd: periodTo,
          notes: notes || undefined,
          contractorIds: allSelected ? undefined : selectedContractors,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json() as Promise<PayoutRun>;
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/runs", selectedStore?.id] });
      setSelectedRunId(run.id);
      setStep("review");
      toast({ title: "Payout run calculated", description: `${run.contractorCount} contractor${run.contractorCount !== 1 ? "s" : ""} · Net ${fmt$(run.totalNet)}` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveRun = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contractor-payouts/runs/${selectedRunId}/approve`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/runs", selectedStore?.id] });
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/run-detail", selectedRunId] });
      setApproveOpen(false);
      if (data.status === "completed") {
        toast({ title: "Payouts sent!", description: "All contractor payouts have been processed." });
      } else {
        toast({ title: "Payouts processed", description: data.errors?.join("; "), variant: data.errors?.length ? "destructive" : "default" });
      }
      setStep("list");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cancelRun = useMutation({
    mutationFn: async (runId: number) => {
      const res = await fetch(`/api/contractor-payouts/runs/${runId}/cancel`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/runs", selectedStore?.id] });
      setStep("list");
      toast({ title: "Run cancelled" });
    },
    onError: () => toast({ title: "Failed to cancel run", variant: "destructive" }),
  });

  const toggleContractor = (id: number) => {
    setSelectedContractors(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  if (step === "create") {
    return (
      <div className="p-6 max-w-[800px] mx-auto space-y-5">
        <button onClick={() => setStep("list")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div>
          <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>New Payout Run</h2>
          <p className="text-sm text-gray-500 mt-0.5">Calculate contractor earnings for a pay period.</p>
        </div>

        {/* Period */}
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardHeader className="border-b border-gray-50 py-4">
            <CardTitle className="text-sm" style={{ fontFamily: "Outfit, sans-serif" }}>Pay Period</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              {PERIOD_PRESETS.map(p => (
                <button key={p.label} onClick={() => { const r = p.fn(); setPeriodFrom(r.from); setPeriodTo(r.to); }}
                  className="px-3 py-1.5 text-xs rounded-full border border-gray-200 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-700 transition-colors">
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-500 mb-1">Period Start</Label>
                <Input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} className="rounded-xl" />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1">Period End</Label>
                <Input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} className="rounded-xl" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1">Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} className="rounded-xl" placeholder="e.g. May week 1" />
            </div>
          </CardContent>
        </Card>

        {/* Contractors */}
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardHeader className="border-b border-gray-50 py-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm" style={{ fontFamily: "Outfit, sans-serif" }}>Contractors</CardTitle>
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
              <Checkbox checked={allSelected} onCheckedChange={v => setAllSelected(!!v)} className="rounded" />
              All contractors
            </label>
          </CardHeader>
          <CardContent className="p-3">
            {activeContractors.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">
                No active contractors. <button onClick={() => navigate("/payouts/contractors")} className="text-teal-600 hover:underline">Add one →</button>
              </div>
            ) : (
              <div className="space-y-1">
                {activeContractors.map(c => (
                  <label key={c.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors
                    ${!allSelected && selectedContractors.includes(c.id) ? "bg-teal-50/50" : ""}`}>
                    <Checkbox
                      checked={allSelected || selectedContractors.includes(c.id)}
                      disabled={allSelected}
                      onCheckedChange={() => toggleContractor(c.id)}
                      className="rounded"
                    />
                    <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-semibold">
                      {c.firstName[0]}{c.lastName[0]}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800">{c.firstName} {c.lastName}</div>
                      <div className="text-xs text-gray-400">{Number(c.commissionRate).toFixed(1)}% commission · {c.payoutMethod === "ach" ? "ACH" : c.payoutMethod === "instant" ? "Instant" : "Check"}</div>
                    </div>
                    {c.onboardingStatus === "complete" && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    )}
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => setStep("list")} className="rounded-xl">Cancel</Button>
          <Button onClick={() => createRun.mutate()}
            disabled={createRun.isPending || !periodFrom || !periodTo}
            className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white gap-2">
            {createRun.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Calculating…</> : <><PlayCircle className="w-4 h-4" /> Calculate Run</>}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "review" && runDetail) {
    const canApprove = runDetail.status === "draft" || runDetail.status === "pending";
    return (
      <div className="p-6 max-w-[900px] mx-auto space-y-5">
        <button onClick={() => setStep("list")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> Back to Runs
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
              Payout Run #{runDetail.id}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {fmtDate(runDetail.periodStart)} – {fmtDate(runDetail.periodEnd)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize ${STATUS_BADGE[runDetail.status] ?? "bg-gray-100 text-gray-500"}`}>
              {runDetail.status}
            </span>
            {canApprove && (
              <>
                <Button variant="outline" size="sm" onClick={() => cancelRun.mutate(runDetail.id)} className="rounded-xl text-red-600 border-red-200 hover:bg-red-50">
                  Cancel Run
                </Button>
                <Button size="sm" onClick={() => setApproveOpen(true)}
                  className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white gap-2">
                  <Zap className="w-4 h-4" /> Approve & Send
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Gross Earnings", value: fmt$(runDetail.totalGross), color: "text-gray-700", bg: "bg-gray-50" },
            { label: "Total Deductions", value: `-${fmt$(runDetail.totalDeductions)}`, color: "text-red-600", bg: "bg-red-50" },
            { label: "Net Payout", value: fmt$(runDetail.totalNet), color: "text-teal-700", bg: "bg-teal-50" },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-4`}>
              <div className="text-xs text-gray-400 mb-1">{s.label}</div>
              <div className={`text-xl font-bold ${s.color}`} style={{ fontFamily: "Outfit, sans-serif" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Items table */}
        <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-gray-50 py-4 px-6">
            <CardTitle className="text-base" style={{ fontFamily: "Outfit, sans-serif" }}>
              Contractor Earnings · {runDetail.contractorCount} contractors
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/50 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-6 py-3">Contractor</th>
                  <th className="text-right px-6 py-3">Appts</th>
                  <th className="text-right px-6 py-3">Gross</th>
                  <th className="text-right px-6 py-3">Deductions</th>
                  <th className="text-right px-6 py-3">Net</th>
                  <th className="text-left px-6 py-3">Method</th>
                  <th className="text-left px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {(runDetail.items ?? []).map(item => (
                  <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-semibold shrink-0">
                          {item.contractorName.split(" ").map(s => s[0]).join("").slice(0,2)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">{item.contractorName}</div>
                          {item.deductions && item.deductions.length > 0 && (
                            <div className="text-xs text-gray-400">
                              {item.deductions.map(d => `${d.name}: -$${d.amount}`).join(" · ")}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500">{item.appointmentCount}</td>
                    <td className="px-6 py-4 text-right text-gray-600">{fmt$(item.grossAmount)}</td>
                    <td className="px-6 py-4 text-right text-red-500">{Number(item.totalDeductions) > 0 ? `-${fmt$(item.totalDeductions)}` : "—"}</td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">{fmt$(item.netAmount)}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-gray-500 capitalize">
                        {item.payoutMethod === "ach" ? "ACH" : item.payoutMethod === "instant" ? "Instant" : "Check"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[item.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Approve confirmation dialog */}
        <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "Outfit, sans-serif" }}>Approve & Send Payouts?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600 py-2">
              This will initiate {runDetail.contractorCount} payout{runDetail.contractorCount !== 1 ? "s" : ""} totaling{" "}
              <strong>{fmt$(runDetail.totalNet)}</strong>. Stripe transfers are immediate and cannot be reversed.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveOpen(false)} className="rounded-xl">Cancel</Button>
              <Button onClick={() => approveRun.mutate()} disabled={approveRun.isPending}
                className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white">
                {approveRun.isPending ? "Processing…" : "Confirm & Send"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>Payout Runs</h2>
          <p className="text-sm text-gray-500 mt-0.5">Create and manage contractor payout batches</p>
        </div>
        <Button size="sm" onClick={() => setStep("create")}
          className="rounded-xl gap-2 bg-teal-600 hover:bg-teal-700 text-white">
          <Plus className="w-4 h-4" /> New Run
        </Button>
      </div>

      {runsLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : runs.length === 0 ? (
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <PlayCircle className="w-7 h-7 text-teal-600" />
            </div>
            <p className="text-base font-medium text-gray-700" style={{ fontFamily: "Outfit, sans-serif" }}>No payout runs yet</p>
            <p className="text-sm text-gray-400 mt-1 mb-4">Create a run to calculate and send contractor earnings.</p>
            <Button size="sm" onClick={() => setStep("create")} className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white gap-2">
              <Plus className="w-4 h-4" /> Create First Run
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/50 text-xs font-medium text-gray-400 uppercase tracking-wide">
                <th className="text-left px-6 py-3">Period</th>
                <th className="text-left px-6 py-3">Contractors</th>
                <th className="text-right px-6 py-3">Gross</th>
                <th className="text-right px-6 py-3">Net Total</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="text-left px-6 py-3">Created</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/40 cursor-pointer"
                  onClick={() => { setSelectedRunId(r.id); setStep("review"); }}>
                  <td className="px-6 py-4 font-medium text-gray-800">{fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}</td>
                  <td className="px-6 py-4 text-gray-500">{r.contractorCount}</td>
                  <td className="px-6 py-4 text-right text-gray-500">{fmt$(r.totalGross)}</td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-900">{fmt$(r.totalNet)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400 text-xs">{format(new Date(r.createdAt), "MMM d, yyyy")}</td>
                  <td className="px-6 py-4">
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
