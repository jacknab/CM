import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit3, Plus, X, Tag, Users } from "lucide-react";
import type { AccountOverview, Tag as TagType, Owner } from "@/lib/support-api";
import { supportApi } from "@/lib/support-api";
import { format } from "date-fns";
import { clsx } from "clsx";

type Props = {
  accountId: number;
  store: AccountOverview["store"];
  owner: AccountOverview["owner"];
  subscription: AccountOverview["subscription"];
  staffCount: number;
};

const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  slate:   { bg: "bg-slate-100",   text: "text-slate-700",   border: "border-slate-200" },
  red:     { bg: "bg-red-100",     text: "text-red-700",     border: "border-red-200" },
  amber:   { bg: "bg-amber-100",   text: "text-amber-700",   border: "border-amber-200" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  sky:     { bg: "bg-sky-100",     text: "text-sky-700",     border: "border-sky-200" },
  indigo:  { bg: "bg-indigo-100",  text: "text-indigo-700",  border: "border-indigo-200" },
  violet:  { bg: "bg-violet-100",  text: "text-violet-700",  border: "border-violet-200" },
};
const COLOR_OPTIONS = Object.entries(TAG_COLORS);

function SnapshotSection({ store, owner, subscription, staffCount }: Omit<Props, "accountId">) {
  const fmt = (d?: string | null) => d ? format(new Date(d), "MMM d, yyyy") : "—";
  const rows = [
    { label: "Industry",       value: store.category ?? "—" },
    { label: "Employees",      value: staffCount?.toString() ?? "—" },
    { label: "Time Zone",      value: store.timezone ?? "—" },
    { label: "Account Created",value: fmt(owner.signupDate) },
    { label: "Trial End",      value: fmt(owner.trialEndsAt) },
    { label: "Next Billing",   value: fmt(subscription?.renewalDate) },
    { label: "Payment",        value: subscription?.paymentLast4 ? `${subscription.paymentBrand ?? ""} ····${subscription.paymentLast4}` : "—" },
  ];
  return (
    <div className="p-3 border-b border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-700">Client Snapshot</p>
        <button className="flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"><Edit3 size={10} />Edit</button>
      </div>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.label} className="flex items-start justify-between gap-2">
            <span className="text-[10px] text-slate-500 flex-shrink-0 w-24">{r.label}</span>
            <span className="text-[10px] text-slate-700 font-medium text-right flex-1 truncate">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TagsSection({ accountId }: { accountId: number }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newColor, setNewColor] = useState("indigo");

  const { data: tags = [] } = useQuery<TagType[]>({
    queryKey: ["support-tags", accountId],
    queryFn: () => supportApi.accounts.tags(accountId),
    staleTime: 30_000,
  });

  const addTag    = useMutation({ mutationFn: ({ tag, color }: { tag: string; color: string }) => supportApi.accounts.addTag(accountId, tag, color), onSuccess: () => { setNewTag(""); setAdding(false); qc.invalidateQueries({ queryKey: ["support-tags", accountId] }); } });
  const removeTag = useMutation({ mutationFn: (id: number) => supportApi.accounts.removeTag(accountId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["support-tags", accountId] }) });

  return (
    <div className="p-3 border-b border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5"><Tag size={12} className="text-slate-400" /><p className="text-xs font-semibold text-slate-700">Tags</p></div>
        <button onClick={() => setAdding(a => !a)} className="flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"><Plus size={10} />Add</button>
      </div>
      {adding && (
        <div className="mb-2 space-y-1.5">
          <input type="text" value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newTag.trim()) addTag.mutate({ tag: newTag.trim(), color: newColor }); }} placeholder="Tag name…" className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400" autoFocus />
          <div className="flex items-center gap-1 flex-wrap">
            {COLOR_OPTIONS.map(([c, cfg]) => <button key={c} onClick={() => setNewColor(c)} className={clsx("w-5 h-5 rounded-full border-2 transition", cfg.bg, newColor === c ? "border-slate-600 scale-110" : "border-transparent")} title={c} />)}
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setAdding(false)} className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-slate-50">Cancel</button>
            <button onClick={() => newTag.trim() && addTag.mutate({ tag: newTag.trim(), color: newColor })} disabled={!newTag.trim() || addTag.isPending} className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1 rounded">{addTag.isPending ? "Adding…" : "Add"}</button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && <p className="text-[10px] text-slate-400 italic">No tags yet</p>}
        {tags.map(t => {
          const cfg = TAG_COLORS[t.color] ?? TAG_COLORS.slate;
          return (
            <span key={t.id} className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border", cfg.bg, cfg.text, cfg.border)}>
              {t.tag}
              <button onClick={() => removeTag.mutate(t.id)} className="hover:opacity-70 transition ml-0.5"><X size={9} /></button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function AccountOwnersSection({ accountId }: { accountId: number }) {
  const { data: owners = [] } = useQuery<Owner[]>({
    queryKey: ["support-owners", accountId],
    queryFn: () => supportApi.accounts.owners(accountId),
    staleTime: 60_000,
  });
  return (
    <div className="p-3">
      <div className="flex items-center gap-1.5 mb-2"><Users size={12} className="text-slate-400" /><p className="text-xs font-semibold text-slate-700">Account Owners</p></div>
      <div className="space-y-2">
        {owners.length === 0 && <p className="text-[10px] text-slate-400 italic">No owners found</p>}
        {owners.map(o => {
          const initials = o.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
          return (
            <div key={o.id} className="flex items-center gap-2">
              {o.profileImageUrl ? <img src={o.profileImageUrl} alt={o.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                : <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">{initials}</div>}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-700 truncate">{o.name}</div>
                <div className="text-[10px] text-slate-400 truncate">{o.role} · {o.email}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InlineNotesSection({ accountId }: { accountId: number }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [content, setContent] = useState("");
  const { data: notes = [] } = useQuery<any[]>({ queryKey: ["support-notes", accountId], queryFn: () => supportApi.accounts.notes(accountId), staleTime: 30_000 });
  const addNote = useMutation({ mutationFn: (c: string) => supportApi.accounts.addNote(accountId, c), onSuccess: () => { setContent(""); setAdding(false); qc.invalidateQueries({ queryKey: ["support-notes", accountId] }); } });

  return (
    <div className="p-3 border-b border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-700">Internal Notes</p>
        <button onClick={() => setAdding(a => !a)} className="flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"><Plus size={10} />Add Note</button>
      </div>
      {adding && (
        <div className="mb-2 space-y-1.5">
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Add a note…" className="w-full text-xs border border-amber-200 rounded-lg p-2 resize-none bg-amber-50 focus:outline-none" rows={3} autoFocus />
          <div className="flex justify-end gap-1.5">
            <button onClick={() => setAdding(false)} className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-slate-50">Cancel</button>
            <button onClick={() => content.trim() && addNote.mutate(content)} disabled={!content.trim() || addNote.isPending} className="text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-3 py-1 rounded font-medium">Save</button>
          </div>
        </div>
      )}
      <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin">
        {notes.length === 0 && !adding && <p className="text-[10px] text-slate-400 italic">No notes yet</p>}
        {notes.map((n: any) => (
          <div key={n.id} className="bg-amber-50 rounded-lg p-2">
            <p className="text-[11px] text-slate-700 leading-snug">{n.content}</p>
            <p className="text-[9px] text-slate-400 mt-1">{n.agent_name} · {new Date(n.created_at).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountHealthSection({ health }: { health: NonNullable<AccountOverview["health"]> }) {
  const checks = [
    { label: "All systems operational", ok: ["online","connected","secure"].includes(health.booking) || health.booking === "online" },
    { label: "Platform active",          ok: health.email === "connected" },
    { label: "Active usage",            ok: health.booking === "online" || health.ai === "online" },
    { label: "No open critical issues", ok: true },
  ];
  const score = Math.round((checks.filter(c => c.ok).length / checks.length) * 100);
  const healthColor = score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-rose-600";
  const badgeColor  = score >= 80 ? "bg-emerald-100 text-emerald-700" : score >= 50 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700";

  return (
    <div className="p-3 border-t border-slate-100">
      <p className="text-xs font-semibold text-slate-700 mb-3">Account Health</p>
      <div className="flex items-center gap-3 mb-3">
        <span className={clsx("text-3xl font-extrabold leading-none", healthColor)}>{score}%</span>
        <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full", badgeColor)}>
          {score >= 80 ? "Healthy" : score >= 50 ? "Fair" : "At Risk"}
        </span>
      </div>
      <div className="space-y-1.5">
        {checks.map(c => (
          <div key={c.label} className="flex items-center gap-2">
            <div className={clsx("w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0",
              c.ok ? "bg-emerald-100" : "bg-rose-100")}>
              {c.ok
                ? <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" viewBox="0 0 12 12"><path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5"/></svg>
                : <X size={8} className="text-rose-500" />}
            </div>
            <span className="text-[11px] text-slate-600">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ActivitySnapshotPanel({ accountId, store, owner, subscription, staffCount, health }: Props & { health?: AccountOverview["health"] }) {
  return (
    <div className="w-72 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-y-auto scrollbar-thin">
      <SnapshotSection store={store} owner={owner} subscription={subscription} staffCount={staffCount} />
      <InlineNotesSection accountId={accountId} />
      <TagsSection accountId={accountId} />
      <AccountOwnersSection accountId={accountId} />
      {health && <AccountHealthSection health={health} />}
    </div>
  );
}
