import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { supportApi, type SearchResult } from "@/lib/support-api";

// Attach a live chat to a customer account by hand — for visitors who were not signed in to
// Certxa when they opened the chat, so the chat arrived with no account.
export default function LinkChatAccountModal({ chatId, initialQuery, onLinked, onClose }: {
  chatId: string;
  initialQuery?: string;
  onLinked: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const found = await supportApi.search(term);
        if (!cancelled) setResults(found);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q]);

  const link = async (accountId: number) => {
    setLinking(true);
    setError("");
    try {
      await supportApi.chatAccounts.link(chatId, accountId);
      onLinked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link the account.");
      setLinking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white border border-slate-200 rounded-2xl p-5 w-[420px] max-w-[92vw] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800">Link chat to an account</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search business, owner, email, phone, account ID…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white"
          />
        </div>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <div className="max-h-64 overflow-y-auto space-y-1">
          {busy && <div className="flex items-center gap-2 text-xs text-slate-400 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…</div>}
          {!busy && q.trim().length >= 2 && results.length === 0 && <p className="text-xs text-slate-400 py-2">No accounts found.</p>}
          {results.map((r) => (
            <button
              key={r.id}
              disabled={linking}
              onClick={() => link(r.id)}
              className="w-full text-left px-3 py-2 rounded-lg border border-slate-100 hover:bg-slate-50 transition disabled:opacity-50"
            >
              <div className="text-sm font-medium text-slate-800">{r.businessName} <span className="text-slate-400 font-normal">#{r.id}</span></div>
              <div className="text-xs text-slate-500 truncate">{r.ownerEmail}{r.ownerName ? ` · ${r.ownerName}` : ""}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
