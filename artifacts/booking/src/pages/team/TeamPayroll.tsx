import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChevronLeft, ChevronRight, Loader2, Printer } from "lucide-react";

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
  otherDeductions: string;
  netPay: string;
  checkNumber: string | null;
}

const money = (v: string | number) => `$${Number(v || 0).toFixed(2)}`;
const fmtDate = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

export default function TeamPayroll() {
  const [openRunId, setOpenRunId] = useState<number | null>(null);
  if (openRunId) return <RunReview runId={openRunId} onBack={() => setOpenRunId(null)} />;
  return <Overview onOpenRun={setOpenRunId} />;
}

// ── list + schedule ──────────────────────────────────────────────────────
function Overview({ onOpenRun }: { onOpenRun: (id: number) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ schedule: Schedule | null; runs: Run[] }>({
    queryKey: ["/api/payroll/runs"],
    queryFn: async () => (await fetch("/api/payroll/runs", { credentials: "include" })).json(),
  });

  const [freq, setFreq] = useState("weekly");
  const [anchor, setAnchor] = useState("");
  const [offset, setOffset] = useState("0");

  const saveSchedule = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/payroll/schedule", {
        frequency: data?.schedule?.frequency ?? freq,
        anchorDate: data?.schedule?.anchorDate ?? anchor,
        periodEndOffsetDays: Number(data?.schedule?.periodEndOffsetDays ?? offset),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payroll/runs"] });
      toast({ title: "Pay schedule saved" });
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  const setup = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/payroll/schedule", { frequency: freq, anchorDate: anchor, periodEndOffsetDays: Number(offset) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payroll/runs"] });
      toast({ title: "Pay schedule set" });
    },
    onError: () => toast({ title: "Couldn't save — pick a first pay date", variant: "destructive" }),
  });

  const runs = data?.runs ?? [];

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each pay period is created automatically. Review the earnings, approve, then print the paychecks.
          </p>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !data?.schedule ? (
          <div className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Set your pay schedule</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">Done once — periods roll forward from here.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-[15px] font-medium">Frequency</label>
                <Select value={freq} onValueChange={setFreq}>
                  <SelectTrigger className="text-[15px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Every week</SelectItem>
                    <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                    <SelectItem value="semimonthly">Twice a month</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[15px] font-medium">First pay date</label>
                <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="text-[15px]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[15px] font-medium">Period ends</label>
                <Select value={offset} onValueChange={setOffset}>
                  <SelectTrigger className="text-[15px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">On the pay date</SelectItem>
                    <SelectItem value="1">1 day before</SelectItem>
                    <SelectItem value="7">1 week before</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setup.mutate()} disabled={!anchor || setup.isPending}>
                {setup.isPending ? "Saving…" : "Save schedule"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-sm">
              <span className="font-medium capitalize">{data.schedule.frequency.replace("biweekly", "every 2 weeks").replace("semimonthly", "twice a month")}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                first pay {fmtDate(data.schedule.anchorDate)}
                {data.schedule.periodEndOffsetDays ? `, period ends ${data.schedule.periodEndOffsetDays}d before` : ""}
              </span>
              <button
                onClick={() => saveSchedule.mutate()}
                className="ml-auto text-primary hover:underline"
                title="Recalculate periods"
              >
                Refresh
              </button>
            </div>

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
                  <span className="text-sm text-muted-foreground">{fmtDate(r.payDate)}</span>
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

// ── review + approve ─────────────────────────────────────────────────────
function RunReview({ runId, onBack }: { runId: number; onBack: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ run: Run; items: Line[] }>({
    queryKey: [`/api/payroll/runs/${runId}`],
    queryFn: async () => (await fetch(`/api/payroll/runs/${runId}`, { credentials: "include" })).json(),
  });

  const patchLine = useMutation({
    mutationFn: ({ itemId, body }: { itemId: number; body: Record<string, number> }) =>
      apiRequest("PATCH", `/api/payroll/runs/${runId}/items/${itemId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/payroll/runs/${runId}`] }),
  });

  const approve = useMutation({
    mutationFn: () => apiRequest("POST", `/api/payroll/runs/${runId}/approve`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [`/api/payroll/runs/${runId}`] });
      await qc.invalidateQueries({ queryKey: ["/api/payroll/runs"] });
      toast({ title: "Pay period approved" });
    },
    onError: () => toast({ title: "Couldn't approve", variant: "destructive" }),
  });

  const voidRun = useMutation({
    mutationFn: () => apiRequest("POST", `/api/payroll/runs/${runId}/void`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [`/api/payroll/runs/${runId}`] });
      await qc.invalidateQueries({ queryKey: ["/api/payroll/runs"] });
    },
  });

  const items = data?.items ?? [];
  const paid = useMemo(() => items.filter((i) => Number(i.netPay) > 0), [items]);
  const grand = useMemo(() => items.reduce((s, i) => s + Number(i.netPay), 0), [items]);
  const locked = data?.run.status !== "draft";

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
        <button onClick={onBack} className="mb-4 flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ChevronLeft className="h-4 w-4" /> Payroll
        </button>

        {isLoading || !data ? (
          <div className="flex items-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {fmtDate(data.run.periodStart)} – {fmtDate(data.run.periodEnd)}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pay date {fmtDate(data.run.payDate)} · {locked ? "approved" : "review the amounts, then approve"}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Net payroll</div>
                <div className="text-2xl font-semibold tabular-nums">{money(grand)}</div>
              </div>
            </header>

            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5">Staff</th>
                    <th className="px-3 py-2.5 text-right">Appts</th>
                    <th className="px-3 py-2.5 text-right">Commission</th>
                    <th className="px-3 py-2.5 text-right">Tips</th>
                    <th className="px-3 py-2.5 text-right">+ Add</th>
                    <th className="px-3 py-2.5 text-right">− Booth rent</th>
                    <th className="px-3 py-2.5 text-right">− Other</th>
                    <th className="px-3 py-2.5 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2.5 font-medium">{it.staffName}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{it.appointmentCount}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(it.commissionAmount)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(it.tips)}</td>
                      <EditCell value={it.otherEarnings} locked={locked} onCommit={(v) => patchLine.mutate({ itemId: it.id, body: { otherEarnings: v } })} />
                      <EditCell value={it.boothRent} locked={locked} onCommit={(v) => patchLine.mutate({ itemId: it.id, body: { boothRent: v } })} />
                      <EditCell value={it.otherDeductions} locked={locked} onCommit={(v) => patchLine.mutate({ itemId: it.id, body: { otherDeductions: v } })} />
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
                    <Button onClick={() => navigate("/print-checks")}>
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
    </AppLayout>
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
