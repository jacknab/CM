import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Loader2,
  RefreshCw,
  WalletCards,
  XCircle,
} from "lucide-react";

type PayoutStatus = "pending" | "in_transit" | "paid" | "failed" | "canceled";

interface MoneyAmount { amount: number; currency: string }

interface PayoutItem {
  id: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  method: string;
  type: string;
  createdAt: string;
  arrivalDate: string | null;
  description: string | null;
  destination: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  automatic: boolean;
  statementDescriptor: string | null;
}

interface PayoutSummary {
  currency: string;
  available: MoneyAmount[];
  pending: MoneyAmount[];
  nextPayout: PayoutItem | null;
  livemode: boolean;
  canCreatePayout: boolean;
  accountType: string;
}

interface PayoutPage {
  items: PayoutItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || "Something went wrong");
  return body as T;
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function dateLabel(value: string | null, withTime = false) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, withTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }
  ).format(new Date(value));
}

const statusMeta: Record<PayoutStatus, { label: string; classes: string; icon: typeof Clock3 }> = {
  pending: { label: "Pending", classes: "bg-amber-50 text-amber-700 ring-amber-200", icon: Clock3 },
  in_transit: { label: "In transit", classes: "bg-blue-50 text-blue-700 ring-blue-200", icon: ArrowDownToLine },
  paid: { label: "Paid", classes: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CheckCircle2 },
  failed: { label: "Failed", classes: "bg-red-50 text-red-700 ring-red-200", icon: CircleAlert },
  canceled: { label: "Canceled", classes: "bg-gray-100 text-gray-600 ring-gray-200", icon: XCircle },
};

function StatusPill({ status }: { status: PayoutStatus }) {
  const meta = statusMeta[status] ?? statusMeta.pending;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.classes}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

export function CustomPayoutDashboard({ accountType }: { accountType?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("90");
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState<PayoutItem | null>(null);
  const [showPayout, setShowPayout] = useState(false);
  const [amount, setAmount] = useState("");

  const summaryQuery = useQuery<PayoutSummary>({
    queryKey: ["stripe-payout-summary"],
    queryFn: () => apiJson("/api/payments/stripe/payouts/summary"),
  });

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: "10" });
    if (cursor) params.set("cursor", cursor);
    if (status !== "all") params.set("status", status);
    if (period !== "all") {
      const from = Math.floor((Date.now() - Number(period) * 86_400_000) / 1000);
      params.set("from", String(from));
    }
    return `/api/payments/stripe/payouts?${params}`;
  }, [cursor, status, period]);

  const payoutsQuery = useQuery<PayoutPage>({
    queryKey: ["stripe-payouts", cursor, status, period],
    queryFn: () => apiJson(listUrl),
  });

  const summary = summaryQuery.data;
  const currency = summary?.currency || "usd";
  const available = summary?.available.find((item) => item.currency === currency)?.amount ?? 0;
  const pending = summary?.pending.find((item) => item.currency === currency)?.amount ?? 0;

  const createPayout = useMutation({
    mutationFn: async () => {
      if (summary?.canCreatePayout !== true) throw new Error("Manage payouts in your Stripe Dashboard for this connected account.");
      const parsed = Number(amount);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Enter a payout amount greater than zero");
      const amountInMinorUnits = Math.round(parsed * 100);
      if (amountInMinorUnits > available) throw new Error("Amount is greater than your available balance");
      return apiJson<PayoutItem>("/api/payments/stripe/payouts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ amount: amountInMinorUnits, currency, confirmation: true }),
      });
    },
    onSuccess: (payout) => {
      setShowPayout(false);
      setAmount("");
      setCursor(null);
      setCursorStack([]);
      queryClient.invalidateQueries({ queryKey: ["stripe-payout-summary"] });
      queryClient.invalidateQueries({ queryKey: ["stripe-payouts"] });
      toast({ title: "Payout started", description: `${money(payout.amount, payout.currency)} is on its way to your bank.` });
    },
    onError: (error: Error) => toast({ title: "Payout not created", description: error.message, variant: "destructive" }),
  });

  function resetPagination() {
    setCursor(null);
    setCursorStack([]);
  }

  function refresh() {
    summaryQuery.refetch();
    payoutsQuery.refetch();
  }

  if (summaryQuery.isLoading) {
    return <div className="grid min-h-[430px] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-violet-600" aria-label="Loading payouts" /></div>;
  }

  if (summaryQuery.isError) {
    return (
      <div className="grid min-h-[430px] place-items-center px-6 text-center">
        <div><CircleAlert className="mx-auto h-8 w-8 text-red-500" /><p className="mt-3 font-semibold text-gray-900">Payouts could not be loaded</p><p className="mt-1 text-sm text-gray-500">{(summaryQuery.error as Error).message}</p><Button variant="outline" className="mt-4" onClick={refresh}>Try again</Button>{accountType === "standard" && <p className="mt-4 text-sm">You can still manage payouts directly in <a className="font-semibold text-violet-700 underline" href="https://dashboard.stripe.com/payouts" target="_blank" rel="noopener noreferrer">Stripe Dashboard</a>.</p>}</div>
      </div>
    );
  }

  return (
    <div className="bg-white">
      <section className="border-b border-gray-100 px-4 py-5 sm:px-6">
        <div className="grid gap-3 md:grid-cols-[1.35fr_1fr_1fr_auto]">
          <div className="rounded-2xl bg-gray-950 p-5 text-white">
            <div className="flex items-center justify-between"><p className="text-xs font-medium text-gray-400">Available to pay out</p><WalletCards className="h-4 w-4 text-violet-300" /></div>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{money(available, currency)}</p>
            <p className="mt-2 text-xs text-gray-400">Cleared funds in {currency.toUpperCase()}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500">Pending balance</p>
            <p className="mt-3 text-xl font-semibold text-gray-950">{money(pending, currency)}</p>
            <p className="mt-2 text-xs text-gray-500">Still processing</p>
          </div>
          <div className="rounded-2xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500">Next arrival</p>
            <p className="mt-3 text-xl font-semibold text-gray-950">{summary?.nextPayout ? dateLabel(summary.nextPayout.arrivalDate) : "None scheduled"}</p>
            <p className="mt-2 text-xs text-gray-500">{summary?.nextPayout ? money(summary.nextPayout.amount, summary.nextPayout.currency) : "No payout in transit"}</p>
          </div>
          <div className="flex items-stretch md:items-center">
            {user?.role !== "owner" ? <p className="self-center text-xs text-gray-500">Owner approval required</p> : summary?.canCreatePayout ? (
              <Button className="w-full gap-2 rounded-xl bg-violet-600 px-5 hover:bg-violet-700" disabled={available < 1} onClick={() => setShowPayout(true)}>
                <Banknote className="h-4 w-4" /> Pay out
              </Button>
            ) : (
              <Button asChild className="w-full gap-2 rounded-xl bg-violet-600 px-5 hover:bg-violet-700">
                <a href={summary?.livemode ? "https://dashboard.stripe.com/payouts" : "https://dashboard.stripe.com/test/payouts"} target="_blank" rel="noopener noreferrer">
                  <Banknote className="h-4 w-4" /> Open Stripe payouts
                </a>
              </Button>
            )}
          </div>
        </div>
        {!summary?.canCreatePayout && (
          <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900" role="status">
            This connected Stripe account controls its own payouts. Send a payout or change your bank payout schedule in Stripe Dashboard; Certxa cannot initiate one on your behalf. Payouts enabled means Stripe can pay your bank, not that the platform can create payouts.
          </p>
        )}
        {!summary?.livemode && <p className="mt-3 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">Test mode</p>}
      </section>

      <section>
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div><h3 className="text-sm font-semibold text-gray-950">Payout history</h3><p className="mt-0.5 text-xs text-gray-500">Transfers from Stripe to your bank account.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); resetPagination(); }} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
              <option value="all">All statuses</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="in_transit">In transit</option><option value="failed">Failed</option><option value="canceled">Canceled</option>
            </select>
            <select aria-label="Filter by date" value={period} onChange={(event) => { setPeriod(event.target.value); resetPagination(); }} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
              <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option><option value="all">All time</option>
            </select>
            <Button variant="outline" size="sm" className="h-9 gap-2 rounded-lg" onClick={refresh} disabled={payoutsQuery.isFetching}><RefreshCw className={`h-3.5 w-3.5 ${payoutsQuery.isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          </div>
        </div>

        {payoutsQuery.isLoading ? (
          <div className="grid min-h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-violet-600" aria-label="Loading payout history" /></div>
        ) : payoutsQuery.isError ? (
          <div className="grid min-h-64 place-items-center px-6 text-center"><div><CircleAlert className="mx-auto h-7 w-7 text-red-500" /><p className="mt-2 text-sm font-semibold">History could not be loaded</p><Button variant="outline" size="sm" className="mt-3" onClick={() => payoutsQuery.refetch()}>Try again</Button></div></div>
        ) : payoutsQuery.data?.items.length === 0 ? (
          <div className="grid min-h-64 place-items-center px-6 text-center"><div><CalendarClock className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-3 text-sm font-semibold text-gray-800">No payouts found</p><p className="mt-1 text-xs text-gray-500">Try a different status or date range.</p></div></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50/70 text-xs text-gray-500"><tr><th className="px-6 py-3 font-medium">Created</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Arrival</th><th className="px-4 py-3 font-medium">Method</th><th className="px-6 py-3 text-right font-medium">Amount</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {payoutsQuery.data?.items.map((item) => <tr key={item.id} className="cursor-pointer transition-colors hover:bg-violet-50/30" tabIndex={0} onClick={() => setSelected(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelected(item); }}><td className="px-6 py-4"><p className="font-medium text-gray-900">{dateLabel(item.createdAt, true)}</p><p className="mt-0.5 font-mono text-[11px] text-gray-400">{item.id}</p></td><td className="px-4 py-4"><StatusPill status={item.status} /></td><td className="px-4 py-4 text-gray-600">{dateLabel(item.arrivalDate)}</td><td className="px-4 py-4 capitalize text-gray-600">{item.method}</td><td className="px-6 py-4 text-right font-semibold text-gray-950">{money(item.amount, item.currency)}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-gray-100 sm:hidden">{payoutsQuery.data?.items.map((item) => <button key={item.id} type="button" className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-gray-50" onClick={() => setSelected(item)}><div><StatusPill status={item.status} /><p className="mt-2 text-xs text-gray-500">{dateLabel(item.createdAt, true)}</p></div><p className="font-semibold text-gray-950">{money(item.amount, item.currency)}</p></button>)}</div>
          </>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 sm:px-6">
          <p className="text-xs text-gray-500">10 payouts per page</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1 rounded-lg" disabled={cursorStack.length === 0 || payoutsQuery.isFetching} onClick={() => { const stack = [...cursorStack]; const previous = stack.pop() ?? null; setCursorStack(stack); setCursor(previous); }}><ArrowLeft className="h-3.5 w-3.5" /> Previous</Button>
            <Button variant="outline" size="sm" className="gap-1 rounded-lg" disabled={!payoutsQuery.data?.hasMore || !payoutsQuery.data.nextCursor || payoutsQuery.isFetching} onClick={() => { setCursorStack((current) => [...current, cursor]); setCursor(payoutsQuery.data?.nextCursor ?? null); }}>Next <ArrowRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </section>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Payout details</DialogTitle><DialogDescription>Transfer information reported by Stripe.</DialogDescription></DialogHeader>
          {selected && <div className="space-y-4"><div className="flex items-center justify-between rounded-xl bg-gray-50 p-4"><div><p className="text-xs text-gray-500">Amount</p><p className="mt-1 text-2xl font-semibold text-gray-950">{money(selected.amount, selected.currency)}</p></div><StatusPill status={selected.status} /></div><dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><div><dt className="text-xs text-gray-500">Created</dt><dd className="mt-1 font-medium">{dateLabel(selected.createdAt, true)}</dd></div><div><dt className="text-xs text-gray-500">Expected arrival</dt><dd className="mt-1 font-medium">{dateLabel(selected.arrivalDate)}</dd></div><div><dt className="text-xs text-gray-500">Method</dt><dd className="mt-1 font-medium capitalize">{selected.method}</dd></div><div><dt className="text-xs text-gray-500">Schedule</dt><dd className="mt-1 font-medium">{selected.automatic ? "Automatic" : "Manual"}</dd></div></dl>{selected.failureMessage && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{selected.failureMessage}</div>}<div><p className="text-xs text-gray-500">Stripe payout ID</p><p className="mt-1 break-all font-mono text-xs text-gray-700">{selected.id}</p></div></div>}
        </DialogContent>
      </Dialog>

      <Dialog open={showPayout} onOpenChange={(open) => { if (!createPayout.isPending) setShowPayout(open); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Send a payout</DialogTitle><DialogDescription>Move available Stripe funds to your connected bank account. This cannot be undone after Stripe starts processing it.</DialogDescription></DialogHeader>
          <div className="space-y-4"><div className="rounded-xl bg-violet-50 p-4"><p className="text-xs font-medium text-violet-700">Available balance</p><p className="mt-1 text-xl font-semibold text-violet-950">{money(available, currency)}</p></div><div className="space-y-2"><Label htmlFor="payout-amount">Amount ({currency.toUpperCase()})</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">{new Intl.NumberFormat(undefined, { style: "currency", currency }).formatToParts(0).find((part) => part.type === "currency")?.value}</span><Input id="payout-amount" inputMode="decimal" autoFocus value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="h-11 pl-8 text-lg" /></div><button type="button" className="text-xs font-semibold text-violet-700 hover:text-violet-900" onClick={() => setAmount((available / 100).toFixed(2))}>Use full balance</button></div><div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p className="text-xs leading-5 text-amber-800">Confirm the amount carefully. The payout will be submitted to Stripe immediately.</p></div></div>
          <DialogFooter><Button variant="outline" onClick={() => setShowPayout(false)} disabled={createPayout.isPending}>Cancel</Button><Button className="bg-violet-600 hover:bg-violet-700" onClick={() => createPayout.mutate()} disabled={createPayout.isPending || !amount}>{createPayout.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm payout</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
