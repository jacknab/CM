import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { useStaffList } from "@/hooks/use-staff";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Printer, RefreshCw } from "lucide-react";

interface Schedule {
  frequency: string;
  anchorDate: string;
  periodEndOffsetDays: number;
}
interface Run {
  id: number;
  periodStart: string;
  periodEnd: string;
  payDate: string | null;
  status: "draft" | "approved" | "void";
  netTotal: string;
  checksPrintedCount: number;
  autoApprovesOn?: string;
}
interface Line {
  id: number;
  staffId: number;
  staffName: string;
  appointmentCount: number;
  serviceRevenue: string;
  serviceCommission: string;
  productCommission: string;
  tips: string;
  commissionAmount: string;
  otherEarnings: string;
  boothRent: string;
  /** Everything under "other": what the owner typed for this period plus the recurring deductions. */
  otherDeductions: string;
  /** The recurring part, and which deduction took how much. */
  ruleDeductions: string;
  ruleDeductionsDetail: { ruleId: number; name: string; amount: number }[] | null;
  netPay: string;
  checkNumber: string | null;
}
/** A deduction the salon takes from every pay period. */
interface DeductionRule {
  id: number;
  name: string;
  type: "fixed" | "percentage" | "card_tips" | null;
  amount: string;
  /** card_tips: flat fee per tipped card transaction. */
  perTransaction?: string | null;
  appliesTo: "all" | "specific" | null;
  staffId: number | null;
  isActive: boolean | null;
}

/** One completed ticket behind a person's commission for the period. */
interface CommissionTicket {
  id: number;
  ticketNumber: number | null;
  date: string;
  clientName: string;
  serviceName: string;
  addons: string[];
  serviceAmount: string;
  productAmount: string;
  commission: string;
  tip: string;
}
interface CommissionDetail {
  staffName: string;
  timezone: string;
  commissionRate: number;
  productCommissionRate: number;
  tickets: CommissionTicket[];
}

const money = (v: string | number) => `$${Number(v || 0).toFixed(2)}`;
const fmtDate = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || "Payroll request failed");
  return body as T;
}

export default function TeamPayroll() {
  const { selectedStore } = useSelectedStore();
  const [openRunId, setOpenRunId] = useState<number | null>(null);
  const storeId = selectedStore?.id;
  if (openRunId && storeId) return <RunReview runId={openRunId} storeId={storeId} onBack={() => setOpenRunId(null)} />;
  return <Overview storeId={storeId} onOpenRun={setOpenRunId} />;
}

// ── list + schedule ──────────────────────────────────────────────────────
function Overview({ storeId, onOpenRun }: { storeId?: number; onOpenRun: (id: number) => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ schedule: Schedule | null; runs: Run[] }>({
    queryKey: ["/api/payroll/runs", storeId],
    queryFn: async () => readJson(await fetch(`/api/payroll/runs?storeId=${storeId}`, { credentials: "include" })),
    enabled: !!storeId,
  });

  const [freq, setFreq] = useState("weekly");
  const [anchor, setAnchor] = useState("");
  const [offset, setOffset] = useState("7");

  const saveSchedule = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/payroll/schedule", {
        storeId,
        frequency: data?.schedule?.frequency ?? freq,
        anchorDate: data?.schedule?.anchorDate ?? anchor,
        periodEndOffsetDays: Number(data?.schedule?.periodEndOffsetDays ?? offset),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payroll/runs", storeId] });
      toast({ title: "Pay schedule saved" });
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  const setup = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/payroll/schedule", { storeId, frequency: freq, anchorDate: anchor, periodEndOffsetDays: Number(offset) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payroll/runs", storeId] });
      toast({ title: "Pay schedule set" });
    },
    onError: () => toast({ title: "Couldn't save — pick a first pay date", variant: "destructive" }),
  });

  const runs = data?.runs ?? [];

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Each pay period is created automatically. Review the earnings, approve, then print the paychecks.
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => navigate("/print-checks?tab=payroll")}>
            <Printer className="h-4 w-4" /> Check printing
          </Button>
        </header>

        {!storeId || isLoading ? (
          <div className="flex items-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
            <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><h2 className="font-semibold">Payroll could not be loaded</h2><p className="mt-1 text-sm">{(error as Error).message}</p><Button variant="outline" size="sm" className="mt-4 gap-2 bg-white" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" /> Try again</Button></div></div>
          </div>
        ) : (
          <>
            {!data?.schedule ? (
              <div className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Set your pay schedule</h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">Existing pay periods are shown below. Set a schedule to create future periods automatically.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <label className="text-[15px] font-medium">Frequency</label>
                    <Select value={freq} onValueChange={setFreq}><SelectTrigger className="text-[15px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">Every week</SelectItem><SelectItem value="biweekly">Every 2 weeks</SelectItem><SelectItem value="semimonthly">Twice a month</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select>
                  </div>
                  <div className="space-y-1.5"><label className="text-[15px] font-medium">First pay date</label><Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="text-[15px]" /></div>
                  <div className="space-y-1.5"><label className="text-[15px] font-medium">Period ends</label><Select value={offset} onValueChange={setOffset}><SelectTrigger className="text-[15px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">On the pay date</SelectItem><SelectItem value="1">1 day before</SelectItem><SelectItem value="7">1 week before</SelectItem></SelectContent></Select></div>
                </div>
                <div className="flex justify-end"><Button onClick={() => setup.mutate()} disabled={!anchor || setup.isPending}>{setup.isPending ? "Saving…" : "Save schedule"}</Button></div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                <span className="font-medium capitalize">{data.schedule.frequency.replace("biweekly", "every 2 weeks").replace("semimonthly", "twice a month")}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">first pay {fmtDate(data.schedule.anchorDate)}{data.schedule.periodEndOffsetDays ? `, period ends ${data.schedule.periodEndOffsetDays}d before` : ""}</span>
                <button onClick={() => refetch()} disabled={isFetching} className="ml-auto text-primary hover:underline" title="Refresh payroll periods">{isFetching ? "Refreshing…" : "Refresh"}</button>
              </div>
            )}

            {storeId && <DeductionsCard storeId={storeId} />}

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="grid grid-cols-[1.4fr_1fr_.8fr_auto] gap-3 border-b border-border bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Pay period</span>
                <span>Pay date</span>
                <span className="text-right">Net</span>
                <span />
              </div>
              {runs.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No pay periods have closed yet.
                </p>
              )}
              {runs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onOpenRun(r.id)}
                  className="grid w-full grid-cols-[1.4fr_1fr_.8fr_auto] items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40"
                >
                  <span className="text-[15px] font-medium">
                    {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}
                  </span>
                    <span className="text-sm text-muted-foreground">
                      {fmtDate(r.payDate)}
                      {r.status === "draft" && r.autoApprovesOn && <span className="block text-[11px]">Auto-approves {fmtDate(r.autoApprovesOn)}</span>}
                    </span>
                  <span className="text-right text-[15px] tabular-nums">{money(r.netTotal)}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        r.status === "approved" ? "bg-emerald-100 text-emerald-700" : r.status === "void" ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-700",
                      )}
                    >
                      {r.status === "draft" ? "Needs review" : r.status === "approved" ? "Approved" : "Void"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

// ── recurring deductions ─────────────────────────────────────────────────
type RuleType = "fixed" | "percentage" | "card_tips";
const EMPTY_RULE = { name: "", type: "fixed" as RuleType, amount: "", perTransaction: "", appliesTo: "all" as "all" | "specific", staffId: "" };

function DeductionsCard({ storeId }: { storeId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ["/api/payroll/deductions", storeId];
  const { data: rules = [], isLoading } = useQuery<DeductionRule[]>({
    queryKey: key,
    queryFn: async () => readJson(await fetch(`/api/payroll/deductions?storeId=${storeId}`, { credentials: "include" })),
  });
  const { data: staffList } = useStaffList();
  const team = ((staffList as any[] | undefined) ?? []).filter((m) => !["removed", "deactivated"].includes(String(m.status ?? "active")));
  // null = closed; id 0 = a new deduction.
  const [editing, setEditing] = useState<{ id: number; form: typeof EMPTY_RULE } | null>(null);

  // A change to the rules changes every pay period still in review.
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["/api/payroll/runs", storeId] }); };
  const send = async (method: string, url: string, body?: Record<string, unknown>) =>
    readJson(await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, storeId }) }));

  const save = useMutation({
    mutationFn: () => {
      const f = editing!.form;
      const body = { name: f.name, type: f.type, amount: Number(f.amount) || 0, perTransaction: f.type === "card_tips" ? Number(f.perTransaction) || 0 : 0, appliesTo: f.appliesTo, staffId: f.appliesTo === "specific" ? Number(f.staffId) : null };
      return editing!.id ? send("PUT", `/api/payroll/deductions/${editing!.id}`, body) : send("POST", "/api/payroll/deductions", body);
    },
    onSuccess: () => { refresh(); setEditing(null); toast({ title: "Deduction saved" }); },
    onError: (e: Error) => toast({ title: "Couldn't save the deduction", description: e.message, variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: (r: DeductionRule) => send("PUT", `/api/payroll/deductions/${r.id}`, { isActive: r.isActive === false }),
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: "Couldn't change the deduction", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (r: DeductionRule) => send("DELETE", `/api/payroll/deductions/${r.id}`),
    onSuccess: () => { refresh(); toast({ title: "Deduction removed" }); },
    onError: (e: Error) => toast({ title: "Couldn't remove the deduction", description: e.message, variant: "destructive" }),
  });

  const who = (r: DeductionRule) => r.appliesTo === "specific" ? team.find((m) => m.id === r.staffId)?.name ?? "One person" : "Everyone";
  const form = editing?.form;
  const setForm = (patch: Partial<typeof EMPTY_RULE>) => setEditing((cur) => (cur ? { ...cur, form: { ...cur.form, ...patch } } : cur));
  const valid = !!form && form.name.trim() !== "" && (form.appliesTo === "all" || form.staffId !== "") &&
    (form.type === "card_tips" ? Number(form.amount) >= 0 && Number(form.perTransaction) >= 0 && Number(form.amount) + Number(form.perTransaction) > 0 : Number(form.amount) > 0);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="payroll-deductions">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Deductions</h2>
          <p className="text-[13px] text-muted-foreground">Taken from every pay period automatically. Only a card fee on tips touches tips.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing({ id: 0, form: EMPTY_RULE })} data-testid="payroll-deduction-add">Add deduction</Button>
      </div>
      {isLoading ? null : rules.length === 0 ? (
        <p className="border-t border-border px-4 py-5 text-sm text-muted-foreground">No deductions set up.</p>
      ) : rules.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-sm" data-testid={`payroll-deduction-${r.id}`}>
          <span className={cn("min-w-0 flex-1 font-medium", r.isActive === false && "text-muted-foreground")}>{r.name}</span>
          <span className="tabular-nums">{r.type === "card_tips" ? `${Number(r.amount)}% + ${money(r.perTransaction ?? 0)} per card tip` : r.type === "percentage" ? `${Number(r.amount)}% of commission` : `${money(r.amount)} per pay period`}</span>
          <span className="w-28 truncate text-muted-foreground">{who(r)}</span>
          <Switch checked={r.isActive !== false} onCheckedChange={() => toggle.mutate(r)} aria-label={`${r.name} on or off`} />
          <button type="button" className="text-primary hover:underline" onClick={() => setEditing({ id: r.id, form: {
            name: r.name, type: r.type === "percentage" || r.type === "card_tips" ? r.type : "fixed", amount: String(Number(r.amount)), perTransaction: String(Number(r.perTransaction ?? 0)),
            appliesTo: r.appliesTo === "specific" ? "specific" : "all", staffId: r.staffId != null ? String(r.staffId) : "" } })}>Edit</button>
          <button type="button" className="text-muted-foreground hover:underline" onClick={() => { if (window.confirm(`Remove "${r.name}"? It stops coming off future pay periods.`)) remove.mutate(r); }}>Remove</button>
        </div>
      ))}

      {form && (
        <Dialog open onOpenChange={(open) => { if (!open) setEditing(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing!.id ? "Edit deduction" : "Add deduction"}</DialogTitle>
              <DialogDescription>{form.type === "card_tips" ? "For each ticket paid by card that has a tip: a percent of the tip plus a flat fee. Cash tips are not charged." : "It comes off every pay period for anyone who earned commission in it."}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name</label>
                <Input value={form.name} maxLength={60} placeholder="Supply fee" onChange={(e) => setForm({ name: e.target.value })} data-testid="payroll-deduction-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Type</label>
                  <Select value={form.type} onValueChange={(v) => setForm({ type: v as RuleType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="fixed">Dollar amount</SelectItem><SelectItem value="percentage">Percent of commission</SelectItem><SelectItem value="card_tips">Card fee on tips</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{form.type === "card_tips" ? "Percent of tip" : form.type === "percentage" ? "Percent" : "Amount"}</label>
                  <Input type="number" min={0} step="0.01" value={form.amount} placeholder={form.type === "card_tips" ? "2.9" : form.type === "percentage" ? "1.5" : "12.00"} onChange={(e) => setForm({ amount: e.target.value })} data-testid="payroll-deduction-amount" />
                </div>
              </div>
              {form.type === "card_tips" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Plus, per transaction ($)</label>
                  <Input type="number" min={0} step="0.01" value={form.perTransaction} placeholder="0.30" onChange={(e) => setForm({ perTransaction: e.target.value })} data-testid="payroll-deduction-per-transaction" />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Applies to</label>
                <Select value={form.appliesTo} onValueChange={(v) => setForm({ appliesTo: v as "all" | "specific" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Everyone</SelectItem><SelectItem value="specific">One person</SelectItem></SelectContent>
                </Select>
              </div>
              {form.appliesTo === "specific" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Who</label>
                  <Select value={form.staffId} onValueChange={(v) => setForm({ staffId: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose a staff member" /></SelectTrigger>
                    <SelectContent>{team.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={() => save.mutate()} disabled={!valid || save.isPending} data-testid="payroll-deduction-save">{save.isPending ? "Saving…" : "Save"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── review + approve ─────────────────────────────────────────────────────
function RunReview({ runId, storeId, onBack }: { runId: number; storeId: number; onBack: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery<{ run: Run; items: Line[] }>({
    queryKey: ["/api/payroll/runs", storeId, runId],
    queryFn: async () => readJson(await fetch(`/api/payroll/runs/${runId}?storeId=${storeId}`, { credentials: "include" })),
  });

  const patchLine = useMutation({
    mutationFn: ({ itemId, body }: { itemId: number; body: Record<string, number> }) =>
      apiRequest("PATCH", `/api/payroll/runs/${runId}/items/${itemId}`, { ...body, storeId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/payroll/runs", storeId, runId] }),
    onError: (mutationError: Error) => toast({ title: "Adjustment not saved", description: mutationError.message, variant: "destructive" }),
  });

  const approve = useMutation({
    mutationFn: () => apiRequest("POST", `/api/payroll/runs/${runId}/approve`, { storeId }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/payroll/runs", storeId, runId] });
      await qc.invalidateQueries({ queryKey: ["/api/payroll/runs", storeId] });
      toast({ title: "Pay period approved" });
    },
    onError: (mutationError: Error) => toast({ title: "Couldn't approve", description: mutationError.message, variant: "destructive" }),
  });

  const voidRun = useMutation({
    mutationFn: () => apiRequest("POST", `/api/payroll/runs/${runId}/void`, { storeId }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/payroll/runs", storeId, runId] });
      await qc.invalidateQueries({ queryKey: ["/api/payroll/runs", storeId] });
      toast({ title: "Pay period reopened" });
    },
    onError: (mutationError: Error) => toast({ title: "Couldn't reopen", description: mutationError.message, variant: "destructive" }),
  });

  const items = data?.items ?? [];
  const paid = useMemo(() => items.filter((i) => Number(i.netPay) > 0), [items]);
  const grand = useMemo(() => items.reduce((s, i) => s + Number(i.netPay), 0), [items]);
  const locked = data?.run.status !== "draft";
  // The person whose commission is being looked at ticket by ticket.
  const [detailFor, setDetailFor] = useState<{ staffId: number; staffName: string } | null>(null);

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
        <button onClick={onBack} className="mb-4 flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ChevronLeft className="h-4 w-4" /> Payroll
        </button>

        {isLoading ? (
          <div className="flex items-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : isError || !data ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><h2 className="font-semibold">Pay period could not be loaded</h2><p className="mt-1 text-sm">{(error as Error)?.message}</p><Button variant="outline" size="sm" className="mt-4 bg-white" onClick={() => refetch()}>Try again</Button></div></div></div>
        ) : (
          <>
            <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {fmtDate(data.run.periodStart)} – {fmtDate(data.run.periodEnd)}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pay date {fmtDate(data.run.payDate)} · {locked ? "approved" : `three-business-day review window; auto-approves ${fmtDate(data.run.autoApprovesOn ?? null)}`}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Net payroll</div>
                <div className="text-2xl font-semibold tabular-nums">{money(grand)}</div>
              </div>
            </header>

            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5">Staff</th>
                    <th className="px-3 py-2.5 text-right">Appts</th>
                    <th className="px-3 py-2.5 text-right">Commission</th>
                    <th className="px-3 py-2.5 text-right">Tips</th>
                    <th className="px-3 py-2.5 text-right">+ Add</th>
                    <th className="px-3 py-2.5 text-right">− Deductions</th>
                    <th className="px-3 py-2.5 text-right">− Booth rent</th>
                    <th className="px-3 py-2.5 text-right">− Other</th>
                    <th className="px-3 py-2.5 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2.5 font-medium">
                        <button type="button" onClick={() => setDetailFor({ staffId: it.staffId, staffName: it.staffName })} title="See the services behind this commission"
                          className="inline-flex items-center gap-1 text-left underline-offset-2 hover:underline" data-testid={`payroll-detail-${it.staffId}`}>
                          {it.staffName} <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{it.appointmentCount}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(it.commissionAmount)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(it.tips)}</td>
                      <EditCell value={it.otherEarnings} locked={locked} onCommit={(v) => patchLine.mutate({ itemId: it.id, body: { otherEarnings: v } })} />
                      <td className="px-3 py-2.5 text-right tabular-nums" data-testid={`payroll-rule-deductions-${it.staffId}`}
                        title={(it.ruleDeductionsDetail ?? []).map((d) => `${d.name} ${money(d.amount)}`).join(" · ") || undefined}>
                        {Number(it.ruleDeductions) > 0 ? money(it.ruleDeductions) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <EditCell value={it.boothRent} locked={locked} onCommit={(v) => patchLine.mutate({ itemId: it.id, body: { boothRent: v } })} />
                      <EditCell value={(Number(it.otherDeductions) - Number(it.ruleDeductions || 0)).toFixed(2)} locked={locked} onCommit={(v) => patchLine.mutate({ itemId: it.id, body: { otherDeductions: v } })} />
                      <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", Number(it.netPay) <= 0 && "text-muted-foreground")}>
                        {money(it.netPay)}
                        {Number(it.netPay) <= 0 && <div className="text-[10px] font-normal">no check</div>}
                        {it.checkNumber && <div className="text-[10px] font-normal text-muted-foreground">#{it.checkNumber}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {paid.length} of {items.length} get a paycheck · {items.length - paid.length} skipped ($0)
              </p>
              <div className="flex gap-2">
                {locked ? (
                  <>
                    <Button variant="outline" onClick={() => voidRun.mutate()} disabled={voidRun.isPending}>
                      Reopen
                    </Button>
                    <Button onClick={() => navigate(`/print-checks?tab=payroll&runId=${runId}`)}>
                      <Printer className="mr-1.5 h-4 w-4" /> Print paychecks
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => approve.mutate()} disabled={approve.isPending || items.length === 0}>
                    {approve.isPending ? "Approving…" : "Approve pay period"}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      {detailFor && <CommissionDetailDialog runId={runId} storeId={storeId} staffId={detailFor.staffId} staffName={detailFor.staffName} onClose={() => setDetailFor(null)} />}
    </AppLayout>
  );
}

// ── the tickets behind one person's commission ───────────────────────────
function CommissionDetailDialog({ runId, storeId, staffId, staffName, onClose }: { runId: number; storeId: number; staffId: number; staffName: string; onClose: () => void }) {
  const { data, isLoading, isError, error } = useQuery<CommissionDetail>({
    queryKey: ["/api/payroll/runs", storeId, runId, "tickets", staffId],
    queryFn: async () => readJson(await fetch(`/api/payroll/runs/${runId}/staff/${staffId}/tickets?storeId=${storeId}`, { credentials: "include" })),
  });
  const tickets = data?.tickets ?? [];
  const sum = (key: "serviceAmount" | "productAmount" | "commission" | "tip") => tickets.reduce((s, t) => s + Number(t[key]), 0);
  const hasProducts = sum("productAmount") > 0;
  const when = (iso: string) => {
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
    try { return d.toLocaleString("en-US", { ...opts, timeZone: data?.timezone }); } catch { return d.toLocaleString("en-US", opts); }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{staffName}</DialogTitle>
          <DialogDescription>
            {data
              ? `Services and add-ons at ${data.commissionRate}%${hasProducts ? ` · retail products at ${data.productCommissionRate}%` : ""} · before discounts, tax and tips`
              : "Commission by ticket"}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : isError ? (
          <p className="py-6 text-sm text-red-700">{(error as Error)?.message}</p>
        ) : tickets.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No completed tickets in this pay period.</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[620px] text-sm" data-testid="payroll-detail-table">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Services</th>
                  <th className="px-3 py-2 text-right">Service</th>
                  {hasProducts && <th className="px-3 py-2 text-right">Retail</th>}
                  <th className="px-3 py-2 text-right">Commission</th>
                  <th className="px-3 py-2 text-right">Tip</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{when(t.date)}</td>
                    <td className="px-3 py-2">{t.clientName}{t.ticketNumber != null && <span className="ml-1 text-xs text-muted-foreground">#{t.ticketNumber}</span>}</td>
                    <td className="px-3 py-2">
                      {t.serviceName}
                      {t.addons.length > 0 && <div className="text-xs text-muted-foreground">+ {t.addons.join(", ")}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(t.serviceAmount)}</td>
                    {hasProducts && <td className="px-3 py-2 text-right tabular-nums">{money(t.productAmount)}</td>}
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{money(t.commission)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(t.tip)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-muted">
                <tr className="border-t border-border font-semibold">
                  <td className="px-3 py-2" colSpan={3}>{tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(sum("serviceAmount"))}</td>
                  {hasProducts && <td className="px-3 py-2 text-right tabular-nums">{money(sum("productAmount"))}</td>}
                  <td className="px-3 py-2 text-right tabular-nums">{money(sum("commission"))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(sum("tip"))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditCell({ value, locked, onCommit }: { value: string; locked: boolean; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  return (
    <td className="px-3 py-2 text-right">
      {locked ? (
        <span className="tabular-nums">{money(value)}</span>
      ) : (
        <input
          type="number"
          min={0}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => Number(v) !== Number(value) && onCommit(Math.max(0, Number(v) || 0))}
          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right text-sm outline-none"
        />
      )}
    </td>
  );
}
