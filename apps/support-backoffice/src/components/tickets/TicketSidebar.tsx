import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown, CheckCircle, Plus, Trash2, ExternalLink,
  Activity, AlertTriangle, LogIn, RotateCcw, UserX,
  DollarSign, Clock, X, Check, Mail, Phone, CreditCard,
  Globe, Zap, Key, Eye, Building2, User,
} from "lucide-react";
import { api, type TicketDetail, type SupportAgentItem, type AccountOverview, type Task, type Escalation } from "@/lib/api";
import { format, formatDistanceToNow, differenceInHours } from "date-fns";
import { clsx } from "clsx";

interface Props {
  ticketId: number;
  detail: TicketDetail | undefined;
  onUpdated: () => void;
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SideCard({ title, children, action, noPad = false }: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  noPad?: boolean;
}) {
  return (
    <div className="border-b border-slate-100">
      <div className="flex items-center justify-between px-4 py-2.5">
        <h3 className="text-xs font-bold text-slate-700">{title}</h3>
        {action}
      </div>
      <div className={noPad ? "" : "px-4 pb-3"}>{children}</div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 gap-2">
      <span className="text-[10px] text-slate-500 flex-shrink-0">{label}</span>
      <div className="text-right flex-1">{children}</div>
    </div>
  );
}

// ─── Assigned To Card ────────────────────────────────────────────────────────

function AssignedToCard({ detail, onUpdated }: { detail: TicketDetail; onUpdated: () => void }) {
  const qc = useQueryClient();
  const ticket = detail.ticket;
  const [showMenu, setShowMenu] = useState(false);

  const { data: agents = [] } = useQuery<SupportAgentItem[]>({
    queryKey: ["support-agents"],
    queryFn: () => api.agents.list(),
    staleTime: 60_000,
  });

  const update = useMutation({
    mutationFn: (id: number | null) => api.tickets.update(ticket.id, { assignedAgentId: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-ticket", ticket.id] });
      qc.invalidateQueries({ queryKey: ["support-ticket-queue"] });
      setShowMenu(false);
      onUpdated();
    },
  });

  const agentName = ticket.assigned_agent_name ?? "Unassigned";
  const initials  = agentName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="border-b border-slate-100">
      <div className="flex items-center justify-between px-4 py-2.5">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Assigned To</h3>
      </div>
      <div className="px-4 pb-3">
        <div className="relative">
          <button
            onClick={() => setShowMenu(o => !o)}
            className="w-full flex items-center gap-2.5 hover:bg-slate-50 rounded-xl p-2 transition group"
          >
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials || "?"}
            </div>
            <div className="flex-1 text-left">
              <p className="text-xs font-bold text-slate-800 leading-none">{agentName}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Support Agent</p>
            </div>
            <ChevronDown size={12} className="text-slate-400 group-hover:text-slate-600" />
          </button>

          {showMenu && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-30 py-1 max-h-48 overflow-y-auto">
              <button
                onClick={() => update.mutate(null)}
                className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 transition italic"
              >
                Unassigned
              </button>
              {agents.map(a => (
                <button
                  key={a.id}
                  onClick={() => update.mutate(a.id)}
                  className={clsx(
                    "w-full text-left px-3 py-2 text-xs transition",
                    ticket.assigned_agent_id === a.id ? "text-indigo-600 font-bold bg-indigo-50" : "text-slate-700 hover:bg-slate-50"
                  )}
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Ticket Details Card ─────────────────────────────────────────────────────

const CATEGORIES  = ["General", "Billing", "Technical", "AI Receptionist", "Booking", "Website", "SMS", "Account"];
const STATUSES    = ["open", "pending", "waiting", "escalated", "resolved", "closed"];
const PRIORITIES  = ["low", "normal", "high", "urgent"];
const SUBCATS     = ["General Inquiry", "Booking Issues", "Payment Failed", "Login Issue", "Setup Help", "Feature Request", "Bug Report"];
const SOURCES     = ["Live Chat", "Email", "Phone", "Web Form", "API", "Internal"];

const STATUS_BADGE: Record<string, string> = {
  open:      "bg-blue-600 text-white",
  pending:   "bg-amber-500 text-white",
  waiting:   "bg-violet-500 text-white",
  escalated: "bg-red-600 text-white",
  resolved:  "bg-emerald-600 text-white",
  closed:    "bg-slate-400 text-white",
};

const PRIORITY_TEXT: Record<string, string> = {
  urgent: "text-red-600 font-bold",
  high:   "text-rose-600 font-bold",
  normal: "text-blue-600 font-semibold",
  medium: "text-blue-600 font-semibold",
  low:    "text-slate-500",
};

function TicketDetailsCard({ detail, onUpdated }: { detail: TicketDetail; onUpdated: () => void }) {
  const qc     = useQueryClient();
  const ticket = detail.ticket;

  const update = useMutation({
    mutationFn: (data: Parameters<typeof api.tickets.update>[1]) => api.tickets.update(ticket.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-ticket", ticket.id] });
      qc.invalidateQueries({ queryKey: ["support-ticket-queue"] });
      onUpdated();
    },
  });

  const ageHours = differenceInHours(new Date(), new Date(ticket.created_at));
  const statusCls = STATUS_BADGE[ticket.status] ?? "bg-slate-400 text-white";
  const priorCls  = PRIORITY_TEXT[ticket.priority?.toLowerCase()] ?? "text-slate-700";

  return (
    <SideCard
      title="Ticket Details"
      action={<button className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold">Edit</button>}
    >
      <div className="space-y-0.5">
        <FieldRow label="Status">
          <select
            value={ticket.status}
            onChange={e => update.mutate({ status: e.target.value })}
            className={clsx("text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer focus:outline-none border-0", statusCls)}
          >
            {STATUSES.map(s => <option key={s} value={s} className="bg-white text-slate-800">{s.toUpperCase()}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Priority">
          <select
            value={ticket.priority ?? "normal"}
            onChange={e => update.mutate({ priority: e.target.value })}
            className={clsx("text-[10px] bg-transparent border-0 cursor-pointer focus:outline-none capitalize", priorCls)}
          >
            {PRIORITIES.map(p => <option key={p} value={p} className="text-slate-800 font-normal">{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Category">
          <select
            value={ticket.category ?? ""}
            onChange={e => update.mutate({ category: e.target.value || undefined })}
            className="text-[10px] text-slate-700 bg-transparent border-0 cursor-pointer focus:outline-none"
          >
            <option value="">Uncategorized</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Subcategory">
          <select
            value={ticket.subcategory ?? ""}
            onChange={e => update.mutate({ subcategory: e.target.value || undefined })}
            className="text-[10px] text-slate-700 bg-transparent border-0 cursor-pointer focus:outline-none"
          >
            <option value="">None</option>
            {SUBCATS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Source">
          <span className="text-[10px] text-slate-700">{ticket.source ?? "Live Chat"}</span>
        </FieldRow>
        <FieldRow label="First Response">
          <span className="text-[10px] text-slate-700">
            {ticket.first_response_at ? formatDistanceToNow(new Date(ticket.first_response_at), { addSuffix: false }) : `${ageHours}h`}
          </span>
        </FieldRow>
        <FieldRow label="Last Response">
          <span className="text-[10px] text-slate-700">
            {ticket.last_response_at ? formatDistanceToNow(new Date(ticket.last_response_at), { addSuffix: false }) : "—"}
          </span>
        </FieldRow>
        <FieldRow label="Followers">
          <div className="flex items-center gap-1 justify-end">
            {["JS", "MK"].map((i, idx) => (
              <div key={idx} className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-700 text-[8px] font-bold flex items-center justify-center ring-1 ring-white">
                {i}
              </div>
            ))}
            <span className="text-[9px] text-slate-400 ml-0.5">+2</span>
          </div>
        </FieldRow>
      </div>
    </SideCard>
  );
}

// ─── Customer Snapshot Card ───────────────────────────────────────────────────

function CustomerSnapshotCard({ accountId }: { accountId: number }) {
  const navigate = useNavigate();
  const { data: overview } = useQuery<AccountOverview>({
    queryKey: ["support-account-overview", accountId],
    queryFn: () => api.accounts.overview(accountId),
    staleTime: 60_000,
    enabled: !!accountId,
  });

  if (!overview) return (
    <SideCard title="Customer Snapshot">
      <div className="py-3 text-center text-xs text-slate-400 animate-pulse">Loading…</div>
    </SideCard>
  );

  const { store, owner, subscription } = overview;
  const initials = store.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const mrr = subscription?.priceCents ? `$${(subscription.priceCents / 100).toFixed(0)}/mo` : null;

  return (
    <SideCard
      title="Customer Snapshot"
      action={
        <button onClick={() => navigate(`/accounts/${accountId}`)} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5">
          <ExternalLink size={9} /> View 360
        </button>
      }
    >
      {/* Business name + status */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-800 leading-tight">{store.name}</p>
          <span className={clsx(
            "text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
            (store.accountStatus ?? "").toLowerCase() === "active"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          )}>
            {store.accountStatus ?? "Unknown"}
          </span>
        </div>
      </div>

      {/* Details rows */}
      <div className="space-y-1.5">
        {owner.name && (
          <div className="flex items-center gap-2">
            <User size={10} className="text-slate-400 flex-shrink-0" />
            <span className="text-[11px] text-slate-700">{owner.name} (Owner)</span>
          </div>
        )}
        {owner.email && (
          <div className="flex items-center gap-2">
            <Mail size={10} className="text-slate-400 flex-shrink-0" />
            <span className="text-[11px] text-indigo-600 truncate">{owner.email}</span>
          </div>
        )}
        {store.phone && (
          <div className="flex items-center gap-2">
            <Phone size={10} className="text-slate-400 flex-shrink-0" />
            <span className="text-[11px] text-slate-700">{store.phone}</span>
          </div>
        )}
        {subscription?.planName && (
          <div className="flex items-center gap-2">
            <CreditCard size={10} className="text-slate-400 flex-shrink-0" />
            <span className="text-[11px] text-slate-700">
              Plan: {subscription.planName}{mrr ? ` (${mrr})` : ""}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Building2 size={10} className="text-slate-400 flex-shrink-0" />
          <span className="text-[11px] text-slate-500">Account ID: {store.account_id ?? `ACC-${String(accountId).padStart(5, "0")}`}</span>
        </div>
      </div>
    </SideCard>
  );
}

// ─── Linked To Card ──────────────────────────────────────────────────────────

function LinkedToCard({ accountId }: { accountId: number }) {
  const navigate = useNavigate();
  const { data: overview } = useQuery<AccountOverview>({
    queryKey: ["support-account-overview", accountId],
    queryFn: () => api.accounts.overview(accountId),
    staleTime: 60_000,
    enabled: !!accountId,
  });

  const store        = overview?.store;
  const subscription = overview?.subscription;

  const links = [
    { label: "Account",        value: store?.name ?? "—",                   onClick: () => navigate(`/accounts/${accountId}`) },
    { label: "Subscription",   value: subscription?.planName ?? "No plan",   onClick: () => navigate(`/isTeam/billing-investigation/${accountId}`) },
    { label: "AI Receptionist",value: "Active",                              onClick: undefined },
    { label: "Website",        value: store?.bookingSlug ? `${store.bookingSlug}.certxa.com` : "—", onClick: undefined },
    { label: "Last Login",     value: "—",                                   onClick: undefined },
  ];

  return (
    <SideCard title="Linked To">
      <div className="space-y-0.5">
        {links.map(r => (
          <div key={r.label} className="flex items-center justify-between py-1 gap-2">
            <span className="text-[10px] text-slate-500 flex-shrink-0 w-28">{r.label}</span>
            {r.onClick ? (
              <button onClick={r.onClick} className="text-[10px] text-indigo-600 hover:underline font-medium text-right truncate">
                {r.value}
              </button>
            ) : (
              <span className="text-[10px] text-slate-700 font-medium text-right truncate">{r.value}</span>
            )}
          </div>
        ))}
      </div>
    </SideCard>
  );
}

// ─── Quick Actions Card ──────────────────────────────────────────────────────

function QuickActionsCard({ accountId, onUpdated }: { accountId: number; onUpdated: () => void }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<string | null>(null);

  const suspend = useMutation({
    mutationFn: () => api.accounts.suspend(accountId),
    onSuccess: () => { setConfirm(null); qc.invalidateQueries({ queryKey: ["support-account-overview", accountId] }); },
  });

  const extendTrial = useMutation({
    mutationFn: () => api.accounts.extendTrial(accountId, 14),
    onSuccess: () => { setConfirm(null); qc.invalidateQueries({ queryKey: ["support-account-overview", accountId] }); },
  });

  const quickActions = [
    {
      id: "login",
      label: "Login As Customer",
      icon: <LogIn size={11} className="text-indigo-500" />,
      onClick: () => window.open(`/api/support/accounts/${accountId}/login-as`, "_blank"),
    },
    {
      id: "magic-link",
      label: "Send Magic Login Link",
      icon: <Zap size={11} className="text-amber-500" />,
      onClick: () => {},
    },
    {
      id: "password-reset",
      label: "Password Reset",
      icon: <Key size={11} className="text-emerald-500" />,
      onClick: () => {},
    },
    {
      id: "activity",
      label: "View Account Activity",
      icon: <Eye size={11} className="text-blue-500" />,
      onClick: () => { window.location.href = `/accounts/${accountId}/activity`; },
    },
  ];

  return (
    <SideCard title="Quick Actions" noPad>
      <div className="grid grid-cols-2 gap-px bg-slate-100 border-t border-slate-100">
        {quickActions.map(a => (
          <button
            key={a.id}
            onClick={a.onClick}
            className="flex items-start gap-2 px-3 py-3 bg-white hover:bg-slate-50 transition text-left group"
          >
            <span className="mt-0.5 flex-shrink-0">{a.icon}</span>
            <span className="text-[10px] font-medium text-slate-700 group-hover:text-indigo-700 leading-snug transition">{a.label}</span>
          </button>
        ))}
      </div>
    </SideCard>
  );
}

// ─── Tasks Card ──────────────────────────────────────────────────────────────

function TasksCard({ ticketId }: { ticketId: number }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [title, setTitle]   = useState("");

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["support-tasks", ticketId],
    queryFn:  () => api.tickets.tasks(ticketId),
    staleTime: 30_000,
  });

  const addTask = useMutation({
    mutationFn: () => api.tickets.addTask(ticketId, { title: title.trim() }),
    onSuccess:  () => { setTitle(""); setAdding(false); qc.invalidateQueries({ queryKey: ["support-tasks", ticketId] }); },
  });

  const toggleTask = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.tickets.updateTask(ticketId, id, { status }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["support-tasks", ticketId] }),
  });

  const deleteTask = useMutation({
    mutationFn: (id: number) => api.tickets.deleteTask(ticketId, id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["support-tasks", ticketId] }),
  });

  return (
    <SideCard
      title="Tasks"
      action={
        <button onClick={() => setAdding(a => !a)} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5">
          <Plus size={10} /> Add
        </button>
      }
    >
      {adding && (
        <div className="mb-3 space-y-1.5">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && title.trim()) addTask.mutate(); if (e.key === "Escape") setAdding(false); }}
            placeholder="Task title…"
            autoFocus
            className="w-full text-xs border border-indigo-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 bg-indigo-50"
          />
          <div className="flex gap-1.5 justify-end">
            <button onClick={() => setAdding(false)} className="text-[10px] text-slate-500 px-2 py-1 rounded hover:bg-slate-50">Cancel</button>
            <button onClick={() => title.trim() && addTask.mutate()} disabled={!title.trim() || addTask.isPending}
              className="text-[10px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg transition font-semibold">
              {addTask.isPending ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      )}
      {tasks.length === 0 && !adding ? (
        <p className="text-[10px] text-slate-400 text-center py-2 italic">No tasks yet</p>
      ) : (
        <div className="space-y-1.5">
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 group">
              <button
                onClick={() => toggleTask.mutate({ id: task.id, status: task.status === "completed" ? "open" : "completed" })}
                className={clsx(
                  "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition",
                  task.status === "completed" ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-emerald-400"
                )}
              >
                {task.status === "completed" && <Check size={9} className="text-white" />}
              </button>
              <span className={clsx("flex-1 text-[10px] leading-snug", task.status === "completed" ? "line-through text-slate-400" : "text-slate-700")}>
                {task.title}
              </span>
              <button onClick={() => deleteTask.mutate(task.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition p-0.5">
                <Trash2 size={9} />
              </button>
            </div>
          ))}
        </div>
      )}
    </SideCard>
  );
}

// ─── Escalation Card ─────────────────────────────────────────────────────────

function EscalationCard({ ticketId, status }: { ticketId: number; status: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason]     = useState("");
  const [team, setTeam]         = useState("engineering");

  const { data: escalations = [] } = useQuery<Escalation[]>({
    queryKey: ["support-escalations", ticketId],
    queryFn: () => api.tickets.escalations(ticketId),
    staleTime: 30_000,
  });

  const escalate = useMutation({
    mutationFn: () => api.tickets.escalate(ticketId, { reason: reason.trim(), team }),
    onSuccess: () => {
      setReason(""); setShowForm(false);
      qc.invalidateQueries({ queryKey: ["support-escalations", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-ticket-queue"] });
    },
  });

  const isEscalated = status === "escalated";

  return (
    <SideCard
      title="Escalation"
      action={!isEscalated ? (
        <button onClick={() => setShowForm(f => !f)} className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold flex items-center gap-0.5">
          <AlertTriangle size={9} /> Escalate
        </button>
      ) : undefined}
    >
      {isEscalated && (
        <div className="mb-2 flex items-center gap-1.5 px-2 py-1.5 bg-red-50 rounded-lg">
          <AlertTriangle size={11} className="text-red-500" />
          <span className="text-[10px] font-bold text-red-700">Escalated</span>
        </div>
      )}
      {showForm && (
        <div className="space-y-2 mb-3">
          <select value={team} onChange={e => setTeam(e.target.value)}
            className="w-full text-xs border border-red-200 rounded-lg px-2 py-1.5 bg-red-50 focus:outline-none">
            <option value="engineering">Engineering</option>
            <option value="billing">Billing</option>
            <option value="management">Management</option>
            <option value="security">Security</option>
          </select>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for escalation…" rows={2}
            className="w-full text-xs border border-red-200 rounded-lg p-2 resize-none focus:outline-none bg-red-50" />
          <div className="flex gap-1.5 justify-end">
            <button onClick={() => setShowForm(false)} className="text-[10px] text-slate-500 px-2 py-1 rounded">Cancel</button>
            <button onClick={() => reason.trim() && escalate.mutate()} disabled={!reason.trim() || escalate.isPending}
              className="text-[10px] bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-3 py-1 rounded-lg font-bold transition">
              {escalate.isPending ? "…" : "Escalate"}
            </button>
          </div>
        </div>
      )}
      {escalations.length === 0 && !showForm ? (
        <p className="text-[10px] text-slate-400 text-center py-1 italic">No escalations</p>
      ) : (
        <div className="space-y-1.5">
          {escalations.map(e => (
            <div key={e.id} className="text-[10px] bg-red-50 rounded-lg p-2">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="font-bold text-red-800 capitalize">{e.assigned_team}</span>
                <span className="text-red-400 ml-auto">{format(new Date(e.created_at), "MMM d")}</span>
              </div>
              <p className="text-red-700">{e.reason}</p>
            </div>
          ))}
        </div>
      )}
    </SideCard>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export default function TicketSidebar({ ticketId, detail, onUpdated }: Props) {
  const ticket = detail?.ticket;

  if (!ticket) return (
    <div className="w-64 flex-shrink-0 bg-white border-l border-slate-200" />
  );

  const accountId = ticket.account_id;

  return (
    <div className="w-64 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-y-auto scrollbar-thin">
      {/* Assigned To */}
      <AssignedToCard detail={detail!} onUpdated={onUpdated} />

      {/* Ticket Details */}
      <TicketDetailsCard detail={detail!} onUpdated={onUpdated} />

      {/* Customer Snapshot */}
      {accountId && <CustomerSnapshotCard accountId={accountId} />}

      {/* Linked To */}
      {accountId && <LinkedToCard accountId={accountId} />}

      {/* Quick Actions */}
      {accountId && <QuickActionsCard accountId={accountId} onUpdated={onUpdated} />}

      {/* Tasks */}
      <TasksCard ticketId={ticketId} />

      {/* Escalation */}
      <EscalationCard ticketId={ticketId} status={ticket.status} />
    </div>
  );
}
