import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { useStaffList } from "@/hooks/use-staff";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowUpRight, ArrowDownRight, Search, RefreshCw, AlertTriangle,
  Wallet, Receipt, TrendingUp, Filter,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   PaymentsDashboard — the financial-overview sections shown on the Payments &
   Payouts page once Stripe is connected. Rendered inside PaymentSettings.tsx.

   Data: GET /api/payments/overview, GET /api/payments/transactions
   Phase A: summary cards, sales overview, recent payments (read-only).
   ──────────────────────────────────────────────────────────────────────────── */

type Period = "today" | "yesterday" | "week" | "month" | "lastmonth";
const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "lastmonth", label: "Last Month" },
];

interface CardStat { amount: number; comparePct: number | null; compareLabel: string }
interface Overview {
  currency: string;
  cards: {
    today: CardStat; week: CardStat; month: CardStat;
    pendingPayout: { amount: number | null; nextPayout: { amount: number; arrivalDate: string | null } | null };
  };
  salesOverview: {
    period: string; from: string; to: string; transactionCount: number;
    gross: number; refunds: number; fees: number | null; feesAvailable: boolean; net: number;
  };
}
interface Txn {
  id: number; customer: string; service: string; staff: string | null;
  paidAt: string; paidAtLabel: string; method: string; methods: string[];
  amount: number; tip: number; discount: number; status: string; stripePaymentIntentId: string | null;
}
interface TxnPage { items: Txn[]; total: number; offset: number; limit: number; hasMore: boolean }

const money = (n: number | null | undefined, cur = "usd") =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase() }).format(n);

const METHOD_LABELS: Record<string, string> = {
  card: "Card", cash: "Cash", "apple pay": "Apple Pay", apple_pay: "Apple Pay", applepay: "Apple Pay",
  "google pay": "Google Pay", google_pay: "Google Pay", googlepay: "Google Pay",
  "tap to pay": "Tap to Pay", tap_to_pay: "Tap to Pay", m2: "M2 Reader",
  "card (m2 reader)": "M2 Reader", pinpad: "Card", split: "Split", other: "Other", check: "Check", "gift card": "Gift Card",
};
const methodLabel = (m: string) => METHOD_LABELS[m.toLowerCase()] ?? (m.charAt(0).toUpperCase() + m.slice(1));
const METHOD_FILTERS = ["all", "card", "cash", "apple pay", "google pay", "tap to pay", "m2"];

function SummaryCard({ label, value, stat, hint }: { label: string; value: string; stat?: CardStat | null; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {stat?.comparePct != null ? (
        <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${stat.comparePct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          {stat.comparePct >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(stat.comparePct)}% <span className="font-normal text-muted-foreground">{stat.compareLabel}</span>
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
    pending: "bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/25",
    refunded: "bg-blue-500/12 text-blue-600 dark:text-blue-400 border-blue-500/25",
    partially_refunded: "bg-blue-500/12 text-blue-600 dark:text-blue-400 border-blue-500/25",
    failed: "bg-rose-500/12 text-rose-600 dark:text-rose-400 border-rose-500/25",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground border-border";
  const label = status === "partially_refunded" ? "Partial refund" : status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

function SectionHead({ icon: Icon, title, right }: { icon: any; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h2>
      {right}
    </div>
  );
}

function OverviewCell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }) {
  return (
    <div className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${tone === "pos" ? "text-emerald-600 dark:text-emerald-400" : tone === "neg" ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ComingSoon({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/60 p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-foreground"><Icon className="h-4 w-4 text-primary" /> {title}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">{body}</p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-primary/70">Coming in the next update</p>
    </div>
  );
}

export function PaymentsDashboard() {
  const { selectedStore } = useSelectedStore();
  const { data: staff = [] } = useStaffList();
  const [period, setPeriod] = useState<Period>("month");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [method, setMethod] = useState("all");
  const [staffId, setStaffId] = useState("all");
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const pageSize = 25;

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const overviewQ = useQuery<Overview>({
    queryKey: ["/api/payments/overview", selectedStore?.id, period],
    enabled: !!selectedStore?.id,
    queryFn: async () => {
      const r = await fetch(`/api/payments/overview?period=${period}`, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    staleTime: 60_000,
  });

  const txnQ = useQuery<TxnPage>({
    queryKey: ["/api/payments/transactions", selectedStore?.id, period, debouncedSearch, method, staffId, page],
    enabled: !!selectedStore?.id,
    queryFn: async () => {
      const p = new URLSearchParams({ period, limit: String(pageSize), offset: String(page * pageSize) });
      if (debouncedSearch) p.set("search", debouncedSearch);
      if (method !== "all") p.set("method", method);
      if (staffId !== "all") p.set("staffId", staffId);
      const r = await fetch(`/api/payments/transactions?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const cur = overviewQ.data?.currency ?? "usd";
  const so = overviewQ.data?.salesOverview;
  const nextPayout = overviewQ.data?.cards.pendingPayout.nextPayout;

  return (
    <div className="space-y-8">

      {overviewQ.isError && (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/8 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4" /> Unable to load payment data
          </p>
          <p className="mt-1 text-xs text-muted-foreground">We couldn't retrieve your latest payment information.</p>
          <button
            onClick={() => { overviewQ.refetch(); txnQ.refetch(); }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {overviewQ.isLoading || !overviewQ.data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
        ) : (
          <>
            <SummaryCard label="Today" value={money(overviewQ.data.cards.today.amount, cur)} stat={overviewQ.data.cards.today} />
            <SummaryCard label="This Week" value={money(overviewQ.data.cards.week.amount, cur)} stat={overviewQ.data.cards.week} />
            <SummaryCard label="This Month" value={money(overviewQ.data.cards.month.amount, cur)} stat={overviewQ.data.cards.month} />
            <SummaryCard
              label="Pending Payout"
              value={money(overviewQ.data.cards.pendingPayout.amount, cur)}
              hint={
                nextPayout?.arrivalDate
                  ? `Next payout ${new Date(nextPayout.arrivalDate).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`
                  : overviewQ.data.cards.pendingPayout.amount == null
                    ? "Enable Stripe payouts to see this"
                    : "Next payout date not provided by Stripe"
              }
            />
          </>
        )}
      </div>

      {/* Sales Overview */}
      <section>
        <SectionHead
          icon={TrendingUp}
          title="Sales Overview"
          right={
            <Select value={period} onValueChange={(v) => { setPeriod(v as Period); setPage(0); }}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>)}</SelectContent>
            </Select>
          }
        />
        <div className="rounded-xl border bg-card">
          {overviewQ.isLoading || !so ? (
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
              <OverviewCell label="Gross Sales" value={money(so.gross, cur)} sub={`${so.transactionCount} payment${so.transactionCount === 1 ? "" : "s"}`} />
              <OverviewCell label="Refunds" value={so.refunds ? `−${money(so.refunds, cur)}` : money(0, cur)} tone={so.refunds ? "neg" : undefined} />
              <OverviewCell label="Processing Fees" value={so.fees == null ? "—" : `−${money(so.fees, cur)}`} sub={so.fees == null ? "shown under Payouts" : undefined} />
              <OverviewCell label="Net Sales" value={money(so.net, cur)} tone="pos" />
            </div>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Gross = amount collected · Refunds = returned to customers · Net = Gross − Refunds{so?.fees == null ? "" : " − Fees"}.
        </p>
      </section>

      {/* Recent Payments */}
      <section>
        <SectionHead
          icon={Receipt}
          title="Recent Payments"
          right={
            <button
              onClick={() => setShowFilters((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground sm:hidden"
            >
              <Filter className="h-3.5 w-3.5" /> Filters
            </button>
          }
        />

        <div className={`mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] ${showFilters ? "" : "max-sm:hidden"}`}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, service…"
              className="h-9 w-full rounded-lg border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <Select value={method} onValueChange={(v) => { setMethod(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-full text-xs sm:w-[140px]"><SelectValue placeholder="Method" /></SelectTrigger>
            <SelectContent>
              {METHOD_FILTERS.map((m) => <SelectItem key={m} value={m} className="text-xs">{m === "all" ? "All methods" : methodLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={staffId} onValueChange={(v) => { setStaffId(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-full text-xs sm:w-[150px]"><SelectValue placeholder="Staff" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All staff</SelectItem>
              {(staff as any[]).filter((s) => s.status !== "removed").map((s) => (
                <SelectItem key={s.id} value={String(s.id)} className="text-xs">{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {txnQ.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : txnQ.isError ? (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/8 p-6 text-center text-sm text-muted-foreground">
            Couldn't load transactions. <button className="text-primary underline" onClick={() => txnQ.refetch()}>Retry</button>
          </div>
        ) : (txnQ.data?.items.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center">
            <p className="text-sm font-semibold text-foreground">No payments yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Once you process a payment through Certxa for this period, it'll appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border sm:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Customer</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Service</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Method</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {txnQ.data!.items.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{t.customer}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.service}{t.staff ? <span className="text-xs"> · {t.staff}</span> : null}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.paidAtLabel}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.methods.length > 1 ? "Split" : methodLabel(t.method)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{money(t.amount, cur)}</td>
                      <td className="px-4 py-3 text-right"><StatusPill status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 sm:hidden">
              {txnQ.data!.items.map((t) => (
                <div key={t.id} className="rounded-xl border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{t.customer}</p>
                      <p className="truncate text-xs text-muted-foreground">{t.service}{t.staff ? ` · ${t.staff}` : ""}</p>
                    </div>
                    <p className="shrink-0 font-bold tabular-nums text-foreground">{money(t.amount, cur)}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t.paidAtLabel} · {t.methods.length > 1 ? "Split" : methodLabel(t.method)}</span>
                    <StatusPill status={t.status} />
                  </div>
                </div>
              ))}
            </div>

            {txnQ.data && txnQ.data.total > pageSize && (
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, txnQ.data.total)} of {txnQ.data.total}</span>
                <div className="flex gap-2">
                  <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="rounded-lg border bg-card px-3 py-1.5 font-semibold text-foreground disabled:opacity-40">Previous</button>
                  <button disabled={!txnQ.data.hasMore} onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border bg-card px-3 py-1.5 font-semibold text-foreground disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <ComingSoon icon={Wallet} title="Payouts" body="Next payout, recent payouts, and status — from your connected Stripe account." />
        <ComingSoon icon={RefreshCw} title="Refunds" body="Refund history and one-tap refunds through Stripe, with confirmation." />
      </div>
    </div>
  );
}

export default PaymentsDashboard;
