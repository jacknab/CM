import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Printer, CheckCircle2, XCircle, Clock, Search,
  MoreHorizontal, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type Check = {
  id: number; storeId: number; contractorId: number; contractorName: string;
  checkNumber: number; amount: string; payeeName: string; memo: string | null;
  periodStart: string | null; periodEnd: string | null;
  printStatus: string; voidStatus: string; clearedStatus: string;
  issuedAt: string; printedAt: string | null; voidedAt: string | null; clearedAt: string | null;
};

function fmt$(n: string | number) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
}

export default function PayoutsChecks() {
  const { selectedStore } = useSelectedStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [voidTarget, setVoidTarget] = useState<Check | null>(null);

  const { data: checks = [], isLoading } = useQuery<Check[]>({
    queryKey: ["/api/contractor-payouts/checks", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/checks?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const markPrinted = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contractor-payouts/checks/${id}/mark-printed`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/checks", selectedStore?.id] });
      toast({ title: "Check marked as printed" });
    },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  const markCleared = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contractor-payouts/checks/${id}/mark-cleared`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/checks", selectedStore?.id] });
      toast({ title: "Check marked as cleared" });
    },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  const voidCheck = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contractor-payouts/checks/${id}/void`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/checks", selectedStore?.id] });
      toast({ title: "Check voided" });
      setVoidTarget(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = checks.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || c.payeeName.toLowerCase().includes(q) || String(c.checkNumber).includes(q) ||
      (c.memo ?? "").toLowerCase().includes(q);
    const matchS = statusFilter === "all" ||
      (statusFilter === "queued"      && c.printStatus === "queued" && c.voidStatus === "active") ||
      (statusFilter === "printed"     && c.printStatus === "printed" && c.voidStatus === "active") ||
      (statusFilter === "outstanding" && c.clearedStatus === "outstanding" && c.voidStatus === "active") ||
      (statusFilter === "cleared"     && c.clearedStatus === "cleared") ||
      (statusFilter === "voided"      && c.voidStatus === "voided");
    return matchQ && matchS;
  });

  const totalActive = checks.filter(c => c.voidStatus === "active").reduce((s, c) => s + Number(c.amount), 0);
  const totalOutstanding = checks.filter(c => c.clearedStatus === "outstanding" && c.voidStatus === "active").reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>Check Register</h2>
          <p className="text-sm text-gray-500 mt-0.5">Track, print, and reconcile contractor checks</p>
        </div>
        <Button
          onClick={() => navigate("/print-checks")}
          className="gap-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl"
        >
          <Printer className="w-4 h-4" />
          Print Checks &amp; Statements
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Checks Issued", value: String(checks.filter(c => c.voidStatus === "active").length), icon: Printer, bg: "bg-gray-50", color: "text-gray-600" },
          { label: "Outstanding", value: fmt$(totalOutstanding), icon: Clock, bg: "bg-amber-50", color: "text-amber-600" },
          { label: "Total Active", value: fmt$(totalActive), icon: CheckCircle2, bg: "bg-teal-50", color: "text-teal-600" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 flex items-center gap-3`}>
            <s.icon className={`w-5 h-5 ${s.color}`} />
            <div>
              <div className="text-xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by payee, check #, or memo…"
            className="pl-9 rounded-xl border-gray-200 bg-white" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 rounded-xl border-gray-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">All Checks</SelectItem>
            <SelectItem value="queued">Queued to Print</SelectItem>
            <SelectItem value="printed">Printed</SelectItem>
            <SelectItem value="outstanding">Outstanding</SelectItem>
            <SelectItem value="cleared">Cleared</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <Printer className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500">No checks found</p>
            <p className="text-xs text-gray-400 mt-1">Checks are created when you run payouts with "Check" method</p>
          </CardContent>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/50 text-xs font-medium text-gray-400 uppercase tracking-wide">
                <th className="text-left px-6 py-3">Check #</th>
                <th className="text-left px-6 py-3">Payee</th>
                <th className="text-left px-6 py-3">Period</th>
                <th className="text-right px-6 py-3">Amount</th>
                <th className="text-left px-6 py-3">Issued</th>
                <th className="text-left px-6 py-3">Print</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(chk => {
                const isVoided = chk.voidStatus === "voided";
                return (
                  <tr key={chk.id} className={`border-t border-gray-50 hover:bg-gray-50/30 ${isVoided ? "opacity-50" : ""}`}>
                    <td className="px-6 py-4 font-mono font-semibold text-gray-700">{chk.checkNumber}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-800">{chk.payeeName}</div>
                      {chk.memo && <div className="text-xs text-gray-400">{chk.memo}</div>}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {chk.periodStart ? `${chk.periodStart} – ${chk.periodEnd}` : "—"}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">{fmt$(chk.amount)}</td>
                    <td className="px-6 py-4 text-xs text-gray-400">{fmtDate(chk.issuedAt)}</td>
                    <td className="px-6 py-4">
                      {chk.printStatus === "queued" ? (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <Clock className="w-3 h-3" /> Queued
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> {fmtDate(chk.printedAt)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isVoided ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600">Voided</span>
                      ) : chk.clearedStatus === "cleared" ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Cleared</span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600">Outstanding</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {!isVoided && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                              <MoreHorizontal className="w-4 h-4 text-gray-400" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            {chk.printStatus === "queued" && (
                              <DropdownMenuItem onClick={() => markPrinted.mutate(chk.id)}>
                                <Printer className="w-4 h-4 mr-2" /> Mark as Printed
                              </DropdownMenuItem>
                            )}
                            {chk.printStatus === "printed" && (
                              <DropdownMenuItem onClick={() => markPrinted.mutate(chk.id)}>
                                <Printer className="w-4 h-4 mr-2" /> Mark Reprinted
                              </DropdownMenuItem>
                            )}
                            {chk.clearedStatus === "outstanding" && (
                              <DropdownMenuItem onClick={() => markCleared.mutate(chk.id)}>
                                <CheckCircle2 className="w-4 h-4 mr-2" /> Mark Cleared
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-red-600" onClick={() => setVoidTarget(chk)}>
                              <XCircle className="w-4 h-4 mr-2" /> Void Check
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Void confirmation */}
      <Dialog open={!!voidTarget} onOpenChange={v => !v && setVoidTarget(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ fontFamily: "Outfit, sans-serif" }}>
              <AlertTriangle className="w-5 h-5 text-red-500" /> Void Check #{voidTarget?.checkNumber}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            This will void check #{voidTarget?.checkNumber} for{" "}
            <strong>{voidTarget?.payeeName}</strong> ({fmt$(voidTarget?.amount ?? 0)}).
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)} className="rounded-xl">Cancel</Button>
            <Button onClick={() => voidTarget && voidCheck.mutate(voidTarget.id)}
              disabled={voidCheck.isPending}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white">
              {voidCheck.isPending ? "Voiding…" : "Void Check"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
