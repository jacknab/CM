import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { addDays, subDays, startOfWeek, startOfMonth, endOfMonth, format, parseISO } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import { formatInTz } from "@/lib/timezone";
import {
  DollarSign, Users, Calendar, CheckCircle2, Clock, Trash2,
  ChevronRight, FileText, PlayCircle, X, Eye, Download, Printer,
  Settings, ArrowRight, CreditCard,
} from "lucide-react";

type PayrollSettingsData = {
  frequency: string;
  weekStartDay: number;
  monthStartDay: number;
  semiMonthlyDay1: number;
  semiMonthlyDay2: number;
  isConfigured?: boolean;
};

type PayrollRunItem = {
  id: number;
  payrollRunId: number;
  staffId: number;
  staffName: string;
  commissionRate: string;
  appointmentCount: number;
  serviceRevenue: string;
  addonRevenue: string;
  totalRevenue: string;
  commissionAmount: string;
  status: string;
  notes: string | null;
};

type PayrollRun = {
  id: number;
  storeId: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalCommission: string;
  contractorCount: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  finalizedAt: string | null;
  items?: PayrollRunItem[];
};

const PAYROLL_DEFAULTS: PayrollSettingsData = {
  frequency: "monthly", weekStartDay: 1, monthStartDay: 1,
  semiMonthlyDay1: 1, semiMonthlyDay2: 15,
};

function getCurrentPayPeriod(s: PayrollSettingsData): { from: string; to: string } {
  const now = new Date();
  const today = now.getDate();
  const month = now.getMonth();
  const year  = now.getFullYear();

  function fmt(d: Date) { return format(d, "yyyy-MM-dd"); }

  switch (s.frequency) {
    case "weekly": {
      const diff  = (now.getDay() - s.weekStartDay + 7) % 7;
      const start = subDays(now, diff);
      return { from: fmt(start), to: fmt(addDays(start, 6)) };
    }
    case "biweekly": {
      const diff         = (now.getDay() - s.weekStartDay + 7) % 7;
      const thisWeekStart = subDays(now, diff);
      const ANCHOR        = new Date(2025, 0, 6 + ((s.weekStartDay - 1 + 7) % 7));
      const msPerDay      = 864e5;
      const daysSince     = Math.floor((thisWeekStart.getTime() - ANCHOR.getTime()) / msPerDay);
      const block         = Math.floor(Math.floor(daysSince / 7) / 2);
      const start         = addDays(ANCHOR, block * 14);
      return { from: fmt(start), to: fmt(addDays(start, 13)) };
    }
    case "semimonthly": {
      const d1 = s.semiMonthlyDay1, d2 = s.semiMonthlyDay2;
      if (today < d1) {
        const pm = month === 0 ? 11 : month - 1;
        const py = month === 0 ? year - 1 : year;
        return { from: fmt(new Date(py, pm, d2)), to: fmt(new Date(year, month, d1 - 1)) };
      } else if (today < d2) {
        return { from: fmt(new Date(year, month, d1)), to: fmt(new Date(year, month, d2 - 1)) };
      } else {
        return { from: fmt(new Date(year, month, d2)), to: fmt(endOfMonth(now)) };
      }
    }
    case "monthly":
    default: {
      const sd = s.monthStartDay;
      if (today >= sd) {
        return { from: fmt(new Date(year, month, sd)), to: fmt(new Date(year, month + 1, sd - 1)) };
      } else {
        return { from: fmt(new Date(year, month - 1, sd)), to: fmt(new Date(year, month, sd - 1)) };
      }
    }
  }
}

function fmtDate(d: string) {
  try { return format(parseISO(d), "MMM d, yyyy"); } catch { return d; }
}

function fmtMoney(v: string | number) {
  return `$${Number(v).toFixed(2)}`;
}

function exportCSV(run: PayrollRun) {
  const rows = [
    ["Contractor", "Appointments", "Revenue", "Rate (%)", "Commission", "Status"],
    ...(run.items ?? []).map(item => [
      item.staffName,
      String(item.appointmentCount),
      fmtMoney(item.totalRevenue),
      Number(item.commissionRate).toFixed(0),
      fmtMoney(item.commissionAmount),
      item.status === "paid" ? "Paid" : "Pending",
    ]),
    ["", "", "", "TOTAL", fmtMoney(run.totalCommission), ""],
  ];
  const csv = rows
    .map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `earnings-run-${run.periodStart}-to-${run.periodEnd}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function printRun(run: PayrollRun) {
  const rows = (run.items ?? [])
    .map(
      item => `<tr>
        <td>${item.staffName}</td>
        <td style="text-align:center">${item.appointmentCount}</td>
        <td style="text-align:right">${fmtMoney(item.totalRevenue)}</td>
        <td style="text-align:right">${Number(item.commissionRate).toFixed(0)}%</td>
        <td style="text-align:right;font-weight:bold;color:#16a34a">${fmtMoney(item.commissionAmount)}</td>
        <td style="text-align:center">${item.status === "paid" ? "Paid" : "Pending"}</td>
      </tr>`
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Earnings Run</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 32px; color: #1e293b; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    p { color: #64748b; font-size: 13px; margin: 0 0 20px; }
    .summary { display: flex; gap: 24px; margin-bottom: 24px; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 20px; min-width: 140px; }
    .card-label { font-size: 11px; color: #94a3b8; }
    .card-value { font-size: 24px; font-weight: 700; color: #16a34a; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f8fafc; border-bottom: 2px solid #e2e8f0; padding: 8px 10px; text-align: left; color: #64748b; font-weight: 600; }
    td { border-bottom: 1px solid #f1f5f9; padding: 8px 10px; }
    tfoot td { font-weight: 700; background: #f8fafc; border-top: 2px solid #e2e8f0; }
    @media print { body { padding: 0; } }
  </style></head><body>
  <h1>Earnings Run Report</h1>
  <p>${fmtDate(run.periodStart)} – ${fmtDate(run.periodEnd)}${run.status === "finalized" ? " · Paid" : " · Draft"}${run.createdBy ? ` · Created by ${run.createdBy}` : ""}</p>
  <div class="summary">
    <div class="card"><div class="card-label">Total Commission</div><div class="card-value">${fmtMoney(run.totalCommission)}</div></div>
    <div class="card"><div class="card-label">Contractors</div><div class="card-value" style="color:#1e293b">${run.contractorCount}</div></div>
  </div>
  <table>
    <thead><tr><th>Contractor</th><th style="text-align:center">Appts</th><th style="text-align:right">Revenue</th><th style="text-align:right">Rate</th><th style="text-align:right">Commission</th><th style="text-align:center">Status</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="4">Total</td><td style="text-align:right;color:#16a34a">${fmtMoney(run.totalCommission)}</td><td></td></tr></tfoot>
  </table>
  ${run.notes ? `<p style="margin-top:16px;font-style:italic">"${run.notes}"</p>` : ""}
  ${run.finalizedAt ? `<p style="margin-top:8px">Finalized on ${format(new Date(run.finalizedAt), "MMM d, yyyy 'at' h:mm a")}</p>` : ""}
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.print(); };
}

function StatusBadge({ status }: { status: string }) {
  if (status === "finalized") {
    return <Badge className="bg-green-100 text-green-700 border-green-200 no-default-active-elevate gap-1"><CheckCircle2 className="w-3 h-3" />Paid</Badge>;
  }
  return <Badge variant="secondary" className="no-default-active-elevate gap-1"><Clock className="w-3 h-3" />Draft</Badge>;
}

export default function Payroll() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const timezone = selectedStore?.timezone || "UTC";

  const [tab, setTab] = useState<"run" | "history">("run");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");
  const [useCustom, setUseCustom]   = useState(false);
  const [notes, setNotes]           = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [viewRun, setViewRun]       = useState<PayrollRun | null>(null);
  const [deleteRunId, setDeleteRunId] = useState<number | null>(null);
  const [finalizedRun, setFinalizedRun] = useState<PayrollRun | null>(null);

  const { data: payrollSettings } = useQuery<PayrollSettingsData>({
    queryKey: ["/api/payroll-settings", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return PAYROLL_DEFAULTS;
      const res = await fetch(`/api/payroll-settings/${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) return PAYROLL_DEFAULTS;
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const settings = payrollSettings ?? PAYROLL_DEFAULTS;
  const currentPeriod = useMemo(() => getCurrentPayPeriod(settings), [settings]);

  const periodFrom = useCustom && customFrom ? customFrom : currentPeriod.from;
  const periodTo   = useCustom && customTo   ? customTo   : currentPeriod.to;

  const { data: runs = [], isLoading: runsLoading } = useQuery<PayrollRun[]>({
    queryKey: ["/api/payroll-runs", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return [];
      const res = await fetch(`/api/payroll-runs?storeId=${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const { mutate: createRun, isPending: creating } = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payroll-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          storeId:     selectedStore!.id,
          periodStart: periodFrom,
          periodEnd:   periodTo,
          notes:       notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create payroll run");
      }
      return res.json() as Promise<PayrollRun>;
    },
    onSuccess: (run) => {
      toast({ title: "Earnings run created", description: "Review and finalize when ready." });
      qc.invalidateQueries({ queryKey: ["/api/payroll-runs", selectedStore?.id] });
      setConfirmOpen(false);
      setNotes("");
      setViewRun(run);
      setTab("history");
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: "destructive" });
      setConfirmOpen(false);
    },
  });

  const { mutate: finalizeRun, isPending: finalizing } = useMutation({
    mutationFn: async (runId: number) => {
      const res = await fetch(`/api/payroll-runs/${runId}/finalize`, {
        method: "PUT",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to finalize");
      }
      return res.json() as Promise<PayrollRun>;
    },
    onSuccess: (updated) => {
      toast({ title: "Pay period approved & finalized", description: "Data sent to Check Printer and Contractor Payouts." });
      qc.invalidateQueries({ queryKey: ["/api/payroll-runs", selectedStore?.id] });
      setViewRun(null);
      setFinalizedRun(updated);
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const { mutate: deleteRun, isPending: deleting } = useMutation({
    mutationFn: async (runId: number) => {
      const res = await fetch(`/api/payroll-runs/${runId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete");
      }
    },
    onSuccess: () => {
      toast({ title: "Draft deleted" });
      qc.invalidateQueries({ queryKey: ["/api/payroll-runs", selectedStore?.id] });
      setDeleteRunId(null);
      if (viewRun?.id === deleteRunId) setViewRun(null);
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const totalPaid = runs.filter(r => r.status === "finalized").reduce((s, r) => s + Number(r.totalCommission), 0);
  const draftRuns = runs.filter(r => r.status === "draft");
  const isConfigured = settings.isConfigured === true;

  return (
    <AppLayout>
      {/* Back to hub */}
      <div style={{ position:"sticky",top:0,zIndex:40,background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"10px 24px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 3px 0 rgb(0 0 0/.06)",marginLeft:-32,marginRight:-32,marginTop:-24,marginBottom:16 }}>
        <button onClick={()=>navigate("/payouts/contractors")} style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",cursor:"pointer",fontSize:".82rem",fontWeight:600,color:"#374151",whiteSpace:"nowrap" }}>
          ← Staff &amp; Earnings
        </button>
        <div style={{ width:1,height:18,background:"#e5e7eb",flexShrink:0 }} />
        <span style={{ fontSize:".92rem",fontWeight:700,color:"#1c1917" }}>Earnings</span>
      </div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-display font-bold">Earnings</h1>
          <p className="text-sm text-muted-foreground">Commission-based earnings for your contractors</p>
        </div>
      </div>

      {/* Setup required gate */}
      {!isConfigured && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
              <Settings className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-amber-900">Earnings settings not configured</p>
              <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                Before running your first earnings period, you need to configure your pay frequency and pay types.
                Once set, these settings are locked to protect the integrity of your records.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => navigate("/payroll-settings")}
              className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
            >
              Configure Settings
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-green-500/10">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Paid Out</p>
              <p className="text-xl font-bold text-green-600">{fmtMoney(totalPaid)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Runs</p>
              <p className="text-xl font-bold">{runs.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-yellow-500/10">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending Drafts</p>
              <p className="text-xl font-bold">{draftRuns.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="mb-6 w-full sm:w-auto">
          <TabsTrigger value="run" className="flex-1 sm:flex-none">Run Earnings</TabsTrigger>
          <TabsTrigger value="history" className="flex-1 sm:flex-none">
            History
            {runs.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">{runs.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── RUN PAYROLL TAB ── */}
        <TabsContent value="run">
          <div className="max-w-2xl space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="w-4 h-4" />
                  Pay Period
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setUseCustom(false)}
                    className={`text-sm px-3 py-1.5 rounded-md border transition-all ${!useCustom ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-muted-foreground/40"}`}
                  >
                    Current Period
                  </button>
                  <button
                    onClick={() => setUseCustom(true)}
                    className={`text-sm px-3 py-1.5 rounded-md border transition-all ${useCustom ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-muted-foreground/40"}`}
                  >
                    Custom Range
                  </button>
                </div>

                {!useCustom ? (
                  <div className="rounded-lg bg-muted/50 border border-dashed px-4 py-3 text-sm">
                    <span className="text-muted-foreground">Period: </span>
                    <span className="font-medium">{fmtDate(currentPeriod.from)}</span>
                    <span className="text-muted-foreground mx-2">→</span>
                    <span className="font-medium">{fmtDate(currentPeriod.to)}</span>
                    <span className="text-xs text-muted-foreground ml-2 capitalize">({settings.frequency})</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">From</Label>
                      <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="w-44" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">To</Label>
                      <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-44" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="w-4 h-4" />
                  What Gets Calculated
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                  <li>Only <strong className="text-foreground">commission-enabled</strong> contractors are included</li>
                  <li>Only <strong className="text-foreground">completed appointments</strong> within the period count</li>
                  <li>Commission = (service price + add-on prices) × commission rate</li>
                  <li>Tips and discounts are not included in commission base</li>
                </ul>
              </CardContent>
            </Card>

            <div className="space-y-1">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                placeholder="Any notes for this earnings run…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>

            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={useCustom && (!customFrom || !customTo)}
              className="bg-[#1a1f36] hover:bg-[#2d3452] text-white font-semibold px-6"
            >
              <PlayCircle className="w-4 h-4 mr-2" />
              Calculate &amp; Create Earnings Run
            </Button>
          </div>
        </TabsContent>

        {/* ── HISTORY TAB ── */}
        <TabsContent value="history">
          {runsLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
          ) : runs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground">No earnings runs yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Use the "Run Earnings" tab to process your first earnings run.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {runs.map(run => (
                <Card
                  key={run.id}
                  className="hover-elevate cursor-pointer transition-shadow"
                  onClick={() => setViewRun(run)}
                >
                  <CardContent className="p-4 flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">
                          {fmtDate(run.periodStart)} – {fmtDate(run.periodEnd)}
                        </span>
                        <StatusBadge status={run.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {run.contractorCount} contractor{run.contractorCount !== 1 ? "s" : ""} · Created {format(new Date(run.createdAt), "MMM d, yyyy")}
                        {run.createdBy ? ` by ${run.createdBy}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-green-600">{fmtMoney(run.totalCommission)}</p>
                      <p className="text-xs text-muted-foreground">total commission</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── CONFIRM CREATE DIALOG ── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Earnings Run?</AlertDialogTitle>
            <AlertDialogDescription>
              This will calculate commissions for all commission-enabled contractors for the period{" "}
              <strong>{fmtDate(periodFrom)}</strong> to <strong>{fmtDate(periodTo)}</strong>.
              The run will be saved as a draft — you can review it and finalize when ready.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => createRun()}
              disabled={creating}
              className="bg-[#1a1f36] hover:bg-[#2d3452]"
            >
              {creating ? "Calculating…" : "Create Run"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── DELETE CONFIRM ── */}
      <AlertDialog open={deleteRunId !== null} onOpenChange={() => setDeleteRunId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this draft earnings run. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteRunId && deleteRun(deleteRunId)}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── VIEW RUN DETAIL DIALOG ── */}
      <Dialog open={!!viewRun} onOpenChange={(o) => !o && setViewRun(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewRun && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <DialogTitle className="text-lg font-bold">
                      Earnings Run — {fmtDate(viewRun.periodStart)} to {fmtDate(viewRun.periodEnd)}
                    </DialogTitle>
                    <DialogDescription className="mt-0.5">
                      {viewRun.contractorCount} contractor{viewRun.contractorCount !== 1 ? "s" : ""}
                      {viewRun.createdBy ? ` · Created by ${viewRun.createdBy}` : ""}
                    </DialogDescription>
                  </div>
                  <StatusBadge status={viewRun.status} />
                </div>
              </DialogHeader>

              {/* Summary */}
              <div className="flex flex-wrap gap-3 my-2">
                <div className="flex-1 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Commission</p>
                  <p className="text-2xl font-bold text-green-600">{fmtMoney(viewRun.totalCommission)}</p>
                </div>
                <div className="flex-1 rounded-lg bg-muted/50 border px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground">Contractors</p>
                  <p className="text-2xl font-bold">{viewRun.contractorCount}</p>
                </div>
              </div>

              {/* Line items */}
              {viewRun.items && viewRun.items.length > 0 ? (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Contractor</th>
                        <th className="text-center py-2 px-3 font-medium text-muted-foreground">Appts</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Revenue</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Rate</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Commission</th>
                        <th className="text-center py-2 px-3 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewRun.items.map(item => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-2.5 px-3 font-medium">{item.staffName}</td>
                          <td className="py-2.5 px-3 text-center text-muted-foreground">{item.appointmentCount}</td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">{fmtMoney(item.totalRevenue)}</td>
                          <td className="py-2.5 px-3 text-right">
                            <Badge variant="secondary" className="no-default-active-elevate">{Number(item.commissionRate).toFixed(0)}%</Badge>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-green-600">{fmtMoney(item.commissionAmount)}</td>
                          <td className="py-2.5 px-3 text-center">
                            {item.status === "paid"
                              ? <Badge className="bg-green-100 text-green-700 border-green-200 no-default-active-elevate text-xs">Paid</Badge>
                              : <Badge variant="outline" className="no-default-active-elevate text-xs">Pending</Badge>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/30 border-t font-semibold">
                        <td colSpan={4} className="py-2.5 px-3">Total</td>
                        <td className="py-2.5 px-3 text-right text-green-600">{fmtMoney(viewRun.totalCommission)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">No line items found.</p>
              )}

              {viewRun.notes && (
                <p className="text-sm text-muted-foreground italic border rounded-md px-3 py-2 bg-muted/30">
                  "{viewRun.notes}"
                </p>
              )}

              {viewRun.finalizedAt && (
                <p className="text-xs text-muted-foreground">
                  Finalized on {format(new Date(viewRun.finalizedAt), "MMM d, yyyy 'at' h:mm a")}
                </p>
              )}

              <DialogFooter className="gap-2 flex-wrap">
                {/* Export buttons — always available */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportCSV(viewRun)}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => printRun(viewRun)}
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Print / PDF
                </Button>

                {/* Draft actions */}
                {viewRun.status === "draft" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/5"
                      onClick={() => { setDeleteRunId(viewRun.id); setViewRun(null); }}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Delete Draft
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => finalizeRun(viewRun.id)}
                      disabled={finalizing}
                      className="bg-green-600 hover:bg-green-700 text-white font-semibold"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      {finalizing ? "Finalizing…" : "Approve & Finalize Pay Period"}
                    </Button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => setViewRun(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── POST-FINALIZE SUCCESS DIALOG ── */}
      <Dialog open={!!finalizedRun} onOpenChange={(o) => !o && setFinalizedRun(null)}>
        <DialogContent className="max-w-md">
          {finalizedRun && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-1">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <DialogTitle className="text-base">Pay Period Approved!</DialogTitle>
                    <DialogDescription className="text-xs mt-0.5">
                      {fmtDate(finalizedRun.periodStart)} – {fmtDate(finalizedRun.periodEnd)}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-2 py-1">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{fmtMoney(finalizedRun.totalCommission)}</strong> finalized
                  for <strong className="text-foreground">{finalizedRun.contractorCount}</strong> contractor{finalizedRun.contractorCount !== 1 ? "s" : ""}.
                  The data is ready in both destinations:
                </p>

                <button
                  onClick={() => { setFinalizedRun(null); navigate("/print-checks"); }}
                  className="w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <Printer className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">Check Printer</p>
                    <p className="text-xs text-muted-foreground">Print physical checks for contractors</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>

                <button
                  onClick={() => { setFinalizedRun(null); navigate("/payouts"); }}
                  className="w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                    <CreditCard className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">Contractor Payouts</p>
                    <p className="text-xs text-muted-foreground">Manage ACH / direct deposit payouts</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setFinalizedRun(null)}>
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
