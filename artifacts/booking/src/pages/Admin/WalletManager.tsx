import { useState, useEffect, useCallback } from "react";
import {
  Wallet,
  Plus,
  Minus,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  X,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Bell,
  BellRing,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoreWallet {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  platformCredits: string;
}

interface Transaction {
  id: number;
  storeId: number;
  type: string;
  amount: string;
  description: string;
  balanceAfter: string;
  referenceId: string | null;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(credits: string | number): string {
  const n = parseFloat(String(credits));
  return (n >= 0 ? "$" : "-$") + Math.abs(n).toFixed(2);
}

function balanceColor(credits: string): string {
  const n = parseFloat(credits);
  if (n <= -10) return "#b91c1c";
  if (n < 0)    return "#d97706";
  if (n < 5)    return "#ca8a04";
  return "#15803d";
}

function balanceBg(credits: string): string {
  const n = parseFloat(credits);
  if (n <= -10) return "#fef2f2";
  if (n < 0)    return "#fff7ed";
  if (n < 5)    return "#fefce8";
  return "#f0fdf4";
}

function balanceBorder(credits: string): string {
  const n = parseFloat(credits);
  if (n <= -10) return "#fca5a5";
  if (n < 0)    return "#fed7aa";
  if (n < 5)    return "#fef08a";
  return "#bbf7d0";
}

function typeLabel(type: string): { label: string; color: string; bg: string } {
  switch (type) {
    case "topup":        return { label: "Top-up",      color: "#15803d", bg: "#dcfce7" };
    case "adjustment":   return { label: "Adjustment",  color: "#6d28d9", bg: "#ede9fe" };
    case "ai_call":      return { label: "AI Call",     color: "#0369a1", bg: "#e0f2fe" };
    case "ai_provision": return { label: "Provision",   color: "#0369a1", bg: "#e0f2fe" };
    case "sms":          return { label: "SMS",         color: "#0369a1", bg: "#e0f2fe" };
    default:             return { label: type,          color: "#374151", bg: "#f3f4f6" };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// ─── Adjustment Modal ─────────────────────────────────────────────────────────

function AdjustModal({
  store,
  onClose,
  onDone,
}: {
  store: StoreWallet;
  onClose: () => void;
  onDone: (newBalance: string) => void;
}) {
  const [mode, setMode] = useState<"add" | "deduct">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const currentBal = parseFloat(store.platformCredits);
  const delta = parseFloat(amount) || 0;
  const preview = mode === "add" ? currentBal + delta : currentBal - delta;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setErr("Enter a positive amount."); return; }
    const finalAmt = mode === "add" ? amt : -amt;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/stores/${store.id}/platform-credits`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: finalAmt, reason }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as any).error ?? "Failed to update balance");
      }
      const d = await r.json();
      onDone(d.platformCredits ?? String(preview));
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full"
        style={{ maxWidth: 440, margin: "0 16px" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">Wallet Adjustment</p>
            <p className="font-bold text-gray-900 text-lg leading-tight">{store.name}</p>
            {(store.city || store.state) && (
              <p className="text-sm text-gray-400 mt-0.5">{[store.city, store.state].filter(Boolean).join(", ")}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 mt-0.5">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Current balance */}
          <div
            className="rounded-xl px-4 py-3 mb-5 flex items-center justify-between"
            style={{ background: balanceBg(store.platformCredits), border: `1px solid ${balanceBorder(store.platformCredits)}` }}
          >
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: balanceColor(store.platformCredits) }}>
              Current Balance
            </span>
            <span className="text-xl font-black" style={{ color: balanceColor(store.platformCredits) }}>
              {fmt(store.platformCredits)}
            </span>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-5">
            <button
              type="button"
              onClick={() => setMode("add")}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition-colors"
              style={{
                background: mode === "add" ? "#f0fdf4" : "#fff",
                color: mode === "add" ? "#15803d" : "#6b7280",
                borderRight: "1px solid #e5e7eb",
              }}
            >
              <Plus size={15} /> Add Funds
            </button>
            <button
              type="button"
              onClick={() => setMode("deduct")}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition-colors"
              style={{
                background: mode === "deduct" ? "#fff7ed" : "#fff",
                color: mode === "deduct" ? "#c2410c" : "#6b7280",
              }}
            >
              <Minus size={15} /> Deduct Funds
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                Amount (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Preview */}
            {amount && parseFloat(amount) > 0 && (
              <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-gray-400 font-semibold">Balance after</span>
                <span
                  className="text-base font-black"
                  style={{ color: preview < -10 ? "#b91c1c" : preview < 0 ? "#d97706" : "#15803d" }}
                >
                  {fmt(preview)}
                </span>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                Reason / Note <span className="text-gray-300 font-normal normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Promotional credit, support resolution…"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              />
            </div>

            {err && (
              <div className="flex items-center gap-2 text-sm text-red-600 font-semibold">
                <AlertTriangle size={14} /> {err}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
                style={{ background: mode === "add" ? "#16a34a" : "#ea580c", opacity: busy ? 0.7 : 1 }}
              >
                {busy
                  ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : mode === "add"
                    ? <><Plus size={14} /> Add Funds</>
                    : <><Minus size={14} /> Deduct Funds</>
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Transaction Drawer ───────────────────────────────────────────────────────

function TransactionDrawer({
  store,
  onClose,
}: {
  store: StoreWallet;
  onClose: () => void;
}) {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/stores/${store.id}/platform-credits/transactions?limit=50`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setTxns(d.transactions ?? []); setLoading(false); })
      .catch(() => { setErr("Failed to load transactions."); setLoading(false); });
  }, [store.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col"
        style={{ maxWidth: 560, width: "100%", margin: "0 16px", maxHeight: "80vh" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">Transaction History</p>
            <p className="font-bold text-gray-900 text-lg">{store.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 mt-0.5">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : err ? (
            <div className="text-center py-16 text-red-500 text-sm font-semibold">{err}</div>
          ) : txns.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-gray-400 gap-2">
              <Clock size={32} className="opacity-30" />
              <p className="text-sm">No transactions yet for this account.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {txns.map(tx => {
                const amt = parseFloat(tx.amount);
                const isCredit = amt >= 0;
                const { label, color, bg } = typeLabel(tx.type);
                return (
                  <div key={tx.id} className="flex items-start gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-gray-50">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: isCredit ? "#dcfce7" : "#fee2e2" }}
                    >
                      {isCredit
                        ? <ArrowUpRight size={15} className="text-green-600" />
                        : <ArrowDownRight size={15} className="text-red-500" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800 truncate">{tx.description}</span>
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                          style={{ color, background: bg }}
                        >
                          {label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(tx.createdAt)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-black ${isCredit ? "text-green-600" : "text-red-500"}`}>
                        {isCredit ? "+" : ""}{fmt(tx.amount)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">→ {fmt(tx.balanceAfter)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Balance Badge ─────────────────────────────────────────────────────────────

function BalanceBadge({ credits }: { credits: string }) {
  const n = parseFloat(credits);
  const Icon = n <= -10 ? AlertTriangle : n < 0 ? AlertTriangle : CheckCircle;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-black"
      style={{ color: balanceColor(credits), background: balanceBg(credits), border: `1px solid ${balanceBorder(credits)}` }}
    >
      {n <= 0 && <Icon size={12} />}
      {fmt(credits)}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WalletManager() {
  const [stores, setStores] = useState<StoreWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "negative" | "at-risk" | "blocked">("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [adjustModal, setAdjustModal] = useState<StoreWallet | null>(null);
  const [txnDrawer, setTxnDrawer] = useState<StoreWallet | null>(null);
  const [alertingSid, setAlertingSid] = useState<number | null>(null);
  const [alertedSids, setAlertedSids] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/wallet-overview", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load wallets");
      const d = await r.json();
      setStores(d.stores ?? []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = stores
    .filter(s => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        s.name.toLowerCase().includes(q) ||
        (s.city ?? "").toLowerCase().includes(q) ||
        (s.state ?? "").toLowerCase().includes(q);

      const bal = parseFloat(s.platformCredits);
      const matchBal =
        balanceFilter === "all"      ? true :
        balanceFilter === "blocked"  ? bal <= -10 :
        balanceFilter === "negative" ? bal < 0 :
        balanceFilter === "at-risk"  ? bal < 5 :
        true;

      return matchSearch && matchBal;
    })
    .sort((a, b) => {
      const diff = parseFloat(a.platformCredits) - parseFloat(b.platformCredits);
      return sortDir === "asc" ? diff : -diff;
    });

  const stats = {
    total:    stores.length,
    blocked:  stores.filter(s => parseFloat(s.platformCredits) <= -10).length,
    negative: stores.filter(s => parseFloat(s.platformCredits) < 0).length,
    atRisk:   stores.filter(s => { const n = parseFloat(s.platformCredits); return n >= 0 && n < 5; }).length,
    healthy:  stores.filter(s => parseFloat(s.platformCredits) >= 5).length,
    totalFloat: stores.reduce((sum, s) => sum + parseFloat(s.platformCredits), 0),
  };

  function handleAdjusted(storeId: number, newBalance: string) {
    setStores(prev => prev.map(s => s.id === storeId ? { ...s, platformCredits: newBalance } : s));
  }

  async function sendAlert(store: StoreWallet) {
    setAlertingSid(store.id);
    try {
      const r = await fetch(`/api/admin/stores/${store.id}/platform-credits/send-alert`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed");
      setAlertedSids(prev => new Set([...prev, store.id]));
    } catch {
      // silently fail — toast is optional
    } finally {
      setAlertingSid(null);
    }
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-7 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Wallet Manager</h1>
          <p className="text-sm text-gray-500 mt-0.5">View and adjust platform credit balances for all accounts.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 text-sm font-bold hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 mb-7" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {[
          { label: "Total Accounts",  value: stats.total,    color: "#6366f1", bg: "#eef2ff" },
          { label: "Blocked (≤ −$10)",value: stats.blocked,  color: "#b91c1c", bg: "#fef2f2" },
          { label: "Negative",        value: stats.negative, color: "#d97706", bg: "#fff7ed" },
          { label: "At Risk (< $5)",  value: stats.atRisk,   color: "#ca8a04", bg: "#fefce8" },
          { label: "Healthy (≥ $5)",  value: stats.healthy,  color: "#15803d", bg: "#f0fdf4" },
        ].map(c => (
          <div
            key={c.label}
            className="rounded-2xl border p-4"
            style={{ background: c.bg, borderColor: c.color + "33" }}
          >
            <p className="text-2xl font-black leading-none" style={{ color: c.color }}>
              {loading ? "—" : c.value}
            </p>
            <p className="text-xs font-bold uppercase tracking-wide mt-1.5" style={{ color: c.color, opacity: 0.7 }}>
              {c.label}
            </p>
          </div>
        ))}
        <div className="rounded-2xl border border-slate-200 bg-slate-800 p-4">
          <p className="text-2xl font-black text-white leading-none">
            {loading ? "—" : fmt(stats.totalFloat)}
          </p>
          <p className="text-xs font-bold uppercase tracking-wide mt-1.5 text-slate-400">
            Total Float
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or city…"
            className="pl-8 pr-4 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 w-56"
          />
        </div>

        <div className="flex rounded-xl border border-gray-200 bg-gray-50 overflow-hidden text-xs font-bold">
          {(["all", "negative", "at-risk", "blocked"] as const).map(f => (
            <button
              key={f}
              onClick={() => setBalanceFilter(f)}
              className="px-3 py-2 transition-colors capitalize"
              style={{
                background: balanceFilter === f ? "#fff" : "transparent",
                color: balanceFilter === f ? "#111" : "#9ca3af",
                boxShadow: balanceFilter === f ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {f === "all" ? "All" : f === "at-risk" ? "At Risk" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <button
          onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Balance {sortDir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        <span className="text-xs text-gray-400 ml-auto">
          {loading ? "Loading…" : `${filtered.length} account${filtered.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Error */}
      {err && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold mb-5">
          <AlertTriangle size={15} /> {err}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={28} className="animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-gray-400 gap-2">
          <Wallet size={36} className="opacity-20" />
          <p className="text-sm font-semibold">No accounts match your filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Account</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Location</th>
                  <th className="px-5 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">Balance</th>
                  <th className="px-5 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((store, i) => {
                  const bal = parseFloat(store.platformCredits);
                  const isBlocked = bal <= -10;
                  const isNeg = bal < 0;
                  return (
                    <tr
                      key={store.id}
                      className="transition-colors hover:bg-gray-50"
                      style={{ borderBottom: i < filtered.length - 1 ? "1px solid #f3f4f6" : "none" }}
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-gray-900">{store.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">ID #{store.id}</p>
                      </td>

                      <td className="px-5 py-3.5 text-gray-500 text-sm">
                        {store.city || store.state
                          ? [store.city, store.state].filter(Boolean).join(", ")
                          : <span className="text-gray-200">—</span>
                        }
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        <BalanceBadge credits={store.platformCredits} />
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        {isBlocked ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                            Blocked
                          </span>
                        ) : isNeg ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                            Negative
                          </span>
                        ) : bal < 5 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                            At Risk
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                            Healthy
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setAdjustModal({ ...store })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-colors"
                          >
                            <Plus size={12} /><Minus size={12} /> Adjust
                          </button>
                          <button
                            onClick={() => setTxnDrawer({ ...store })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 text-xs font-bold hover:bg-gray-50 transition-colors"
                          >
                            <Clock size={12} /> History
                          </button>
                          {bal < 5 && (
                            <button
                              onClick={() => sendAlert(store)}
                              disabled={alertingSid === store.id}
                              title="Send low-balance alert email to store owner"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors"
                              style={alertedSids.has(store.id) ? {
                                border: "1px solid #bbf7d0",
                                background: "#f0fdf4",
                                color: "#15803d",
                                cursor: "default",
                              } : {
                                border: `1px solid ${isBlocked ? "#fca5a5" : "#fed7aa"}`,
                                background: isBlocked ? "#fef2f2" : "#fff7ed",
                                color: isBlocked ? "#b91c1c" : "#c2410c",
                                opacity: alertingSid === store.id ? 0.6 : 1,
                                cursor: alertingSid === store.id ? "wait" : "pointer",
                              }}
                            >
                              {alertingSid === store.id
                                ? <><Loader2 size={11} className="animate-spin" /> Sending…</>
                                : alertedSids.has(store.id)
                                  ? <><CheckCircle size={11} /> Sent</>
                                  : <><BellRing size={11} /> Alert</>
                              }
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {adjustModal && (
        <AdjustModal
          store={adjustModal}
          onClose={() => setAdjustModal(null)}
          onDone={newBalance => {
            handleAdjusted(adjustModal.id, newBalance);
            setAdjustModal(null);
          }}
        />
      )}
      {txnDrawer && (
        <TransactionDrawer
          store={txnDrawer}
          onClose={() => setTxnDrawer(null)}
        />
      )}
    </div>
  );
}
