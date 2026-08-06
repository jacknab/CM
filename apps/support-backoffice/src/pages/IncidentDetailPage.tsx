import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, AlertTriangle, CheckCircle, Clock, RefreshCw,
  Plus, Check, Send, Globe, X, ChevronDown, Users, Trash2,
  FileText, Shield, Activity, MessageSquare,
} from "lucide-react";
import { format, formatDistanceToNow, differenceInMinutes } from "date-fns";
import { clsx } from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncidentDetail {
  incident: {
    id: number;
    title: string;
    description: string | null;
    severity: string;
    status: string;
    affected_accounts: number;
    owner_name: string | null;
    services: string[];
    root_cause: string | null;
    created_at: string;
    resolved_at: string | null;
    duration_sec: number;
    updated_at: string;
  };
  updates: {
    id: number;
    content: string;
    status: string | null;
    author_name: string | null;
    is_public: boolean;
    created_at: string;
  }[];
  tasks: {
    id: number;
    title: string;
    assigned_to_name: string | null;
    status: string;
    created_at: string;
  }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEV_CFG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  "SEV-1": { bg: "bg-red-600",    text: "text-white",  border: "border-red-600",    label: "Critical" },
  "SEV-2": { bg: "bg-orange-500", text: "text-white",  border: "border-orange-500", label: "High" },
  "SEV-3": { bg: "bg-amber-500",  text: "text-white",  border: "border-amber-500",  label: "Medium" },
  "SEV-4": { bg: "bg-blue-500",   text: "text-white",  border: "border-blue-500",   label: "Low" },
};

const STATUS_STEPS = ["investigating", "identified", "monitoring", "resolved", "closed"];
const STATUS_LABEL: Record<string, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
  postmortem_pending: "Postmortem Pending",
  closed: "Closed",
};

function fmtDuration(sec: number): string {
  if (!sec || sec < 0) return "Active";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [updateContent, setUpdateContent]   = useState("");
  const [updateStatus, setUpdateStatus]     = useState("");
  const [updatePublic, setUpdatePublic]     = useState(false);
  const [newTaskTitle, setNewTaskTitle]     = useState("");
  const [showAddTask, setShowAddTask]       = useState(false);
  const [editField, setEditField]           = useState<string | null>(null);
  const [editValue, setEditValue]           = useState("");

  const { data, isLoading, error } = useQuery<IncidentDetail>({
    queryKey: ["incident", id],
    queryFn: () => fetch(`/api/support/incidents/${id}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 15_000, refetchInterval: 30_000,
  });

  const postUpdate = useMutation({
    mutationFn: () =>
      fetch(`/api/support/incidents/${id}/updates`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: updateContent.trim(), status: updateStatus || undefined, isPublic: updatePublic }),
      }).then(r => r.json()),
    onSuccess: () => {
      setUpdateContent(""); setUpdateStatus("");
      qc.invalidateQueries({ queryKey: ["incident", id] });
      qc.invalidateQueries({ queryKey: ["incidents"] });
    },
  });

  const addTask = useMutation({
    mutationFn: () =>
      fetch(`/api/support/incidents/${id}/tasks`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTaskTitle.trim() }),
      }).then(r => r.json()),
    onSuccess: () => { setNewTaskTitle(""); setShowAddTask(false); qc.invalidateQueries({ queryKey: ["incident", id] }); },
  });

  const toggleTask = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: string }) =>
      fetch(`/api/support/incidents/${id}/tasks/${taskId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incident", id] }),
  });

  const updateIncident = useMutation({
    mutationFn: (patch: Record<string, any>) =>
      fetch(`/api/support/incidents/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then(r => r.json()),
    onSuccess: () => {
      setEditField(null);
      qc.invalidateQueries({ queryKey: ["incident", id] });
      qc.invalidateQueries({ queryKey: ["incidents"] });
    },
  });

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading incident…</p>
      </div>
    </div>
  );

  if (error || !data?.incident) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <AlertTriangle size={32} className="text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500">Incident not found</p>
      </div>
    </div>
  );

  const { incident, updates, tasks } = data;
  const sevCfg = SEV_CFG[incident.severity] ?? SEV_CFG["SEV-3"];
  const isResolved = ["resolved","closed"].includes(incident.status);
  const stepIdx = STATUS_STEPS.indexOf(incident.status);
  const durationMin = Math.floor(parseFloat(String(incident.duration_sec)) / 60);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-50">
      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {/* Back + Header */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => navigate("/isTeam/incidents")}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition">
              <ArrowLeft size={13} /> Back to Incidents
            </button>
            <span className="text-slate-300">/</span>
            <span className="text-xs text-slate-500 font-mono">INC-{String(incident.id).padStart(4,"0")}</span>
          </div>
          <div className="flex items-start gap-3">
            <div className={clsx("px-2.5 py-1.5 rounded-xl text-[10px] font-black flex-shrink-0 mt-0.5", sevCfg.bg, sevCfg.text)}>
              {incident.severity} · {sevCfg.label}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-black text-slate-900 leading-tight">{incident.title}</h1>
              <div className="flex items-center gap-4 mt-1 text-[11px] text-slate-500 flex-wrap">
                <span>Created {format(new Date(incident.created_at), "MMM d, yyyy h:mm aa")}</span>
                <span>·</span>
                <span className="flex items-center gap-1"><Clock size={10} /> {fmtDuration(parseFloat(String(incident.duration_sec)))} duration</span>
                {incident.owner_name && <><span>·</span><span>Owner: {incident.owner_name}</span></>}
                {incident.affected_accounts > 0 && (
                  <><span>·</span><span className="text-rose-600 font-semibold">{incident.affected_accounts.toLocaleString()} accounts affected</span></>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={clsx("px-3 py-1.5 rounded-full text-xs font-bold capitalize",
                incident.status === "resolved" ? "bg-emerald-100 text-emerald-700" :
                incident.status === "monitoring" ? "bg-amber-100 text-amber-700" :
                "bg-red-100 text-red-700")}>
                {STATUS_LABEL[incident.status] ?? incident.status}
              </span>
              {!isResolved && (
                <button onClick={() => updateIncident.mutate({ status: "resolved" })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition">
                  <CheckCircle size={11} /> Resolve
                </button>
              )}
            </div>
          </div>

          {/* Status progress bar */}
          <div className="flex items-center gap-1 mt-4">
            {STATUS_STEPS.slice(0, 4).map((s, i) => (
              <div key={s} className="flex items-center gap-1 flex-1">
                <div className={clsx("flex-1 h-1.5 rounded-full transition-colors",
                  i <= stepIdx ? (s === "resolved" ? "bg-emerald-500" : "bg-rose-500") : "bg-slate-200")} />
                <div className={clsx("flex-shrink-0 text-[9px] font-semibold capitalize whitespace-nowrap",
                  i === stepIdx ? "text-slate-800" : "text-slate-400")}>
                  {STATUS_LABEL[s]}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Description */}
          {incident.description && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-700 mb-2">Description</h3>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{incident.description}</p>
            </div>
          )}

          {/* Root Cause */}
          {incident.root_cause && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-800 mb-1 flex items-center gap-1.5">
                <Shield size={11} /> Root Cause Identified
              </h3>
              <p className="text-sm text-amber-900 leading-relaxed">{incident.root_cause}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700">Incident Timeline</h3>
              <span className="text-[10px] text-slate-400">{updates.length} updates</span>
            </div>
            <div className="p-4">
              {/* Incident created */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-7 h-7 rounded-full bg-rose-600 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={11} className="text-white" />
                </div>
                <div className="flex-1 border-b border-slate-50 pb-4">
                  <p className="text-xs font-bold text-slate-800">Incident Created</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{incident.owner_name ?? "System"} opened this incident</p>
                  <p className="text-[10px] text-slate-400 mt-1">{format(new Date(incident.created_at), "MMM d, yyyy h:mm aa")}</p>
                </div>
              </div>

              {/* Updates */}
              {[...updates].reverse().map(upd => (
                <div key={upd.id} className="flex items-start gap-3 mb-4">
                  <div className={clsx("w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white",
                    upd.is_public ? "bg-indigo-600" : "bg-amber-500")}>
                    {(upd.author_name ?? "SA").split(" ").map((w: string) => w[0]).join("").slice(0,2)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-800">{upd.author_name ?? "Agent"}</span>
                      {upd.status && (
                        <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-semibold capitalize">
                          → {STATUS_LABEL[upd.status] ?? upd.status}
                        </span>
                      )}
                      {upd.is_public && (
                        <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                          <Globe size={8} /> Public
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 ml-auto">{formatDistanceToNow(new Date(upd.created_at), { addSuffix: true })}</span>
                    </div>
                    <div className={clsx("rounded-xl px-3.5 py-2.5 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed",
                      upd.is_public ? "bg-indigo-50 border border-indigo-100" : "bg-slate-50 border border-slate-100")}>
                      {upd.content}
                    </div>
                  </div>
                </div>
              ))}

              {isResolved && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                    <CheckCircle size={11} className="text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-700">Incident Resolved</p>
                    {incident.resolved_at && (
                      <p className="text-[10px] text-slate-400 mt-0.5">{format(new Date(incident.resolved_at), "MMM d, yyyy h:mm aa")}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Post update form */}
            {!isResolved && (
              <div className="border-t border-slate-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold text-slate-600">Add Update:</span>
                  <select value={updateStatus} onChange={e => setUpdateStatus(e.target.value)}
                    className="text-[10px] border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 focus:outline-none cursor-pointer">
                    <option value="">No status change</option>
                    {STATUS_STEPS.filter(s => s !== "closed").map(s => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 ml-auto cursor-pointer">
                    <input type="checkbox" checked={updatePublic} onChange={e => setUpdatePublic(e.target.checked)} className="rounded" />
                    <span className="text-[10px] text-slate-600 font-medium flex items-center gap-1"><Globe size={9} />Public update</span>
                  </label>
                </div>
                <textarea
                  value={updateContent}
                  onChange={e => setUpdateContent(e.target.value)}
                  placeholder="Describe what's happening, what was found, or what actions were taken…"
                  rows={3}
                  className="w-full text-sm border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:border-indigo-400 bg-slate-50"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => updateContent.trim() && postUpdate.mutate()}
                    disabled={!updateContent.trim() || postUpdate.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition"
                  >
                    {postUpdate.isPending ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
                    {updatePublic ? "Post Public Update" : "Save Internal Update"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right Sidebar ──────────────────────────────────────────────────────── */}
      <div className="w-64 bg-white border-l border-slate-200 flex flex-col overflow-y-auto scrollbar-thin flex-shrink-0">
        {/* Incident Details */}
        <div className="border-b border-slate-100">
          <div className="px-4 py-3 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700">Incident Details</h3>
            <button className="text-[10px] text-indigo-600 font-semibold hover:underline">Edit</button>
          </div>
          <div className="px-4 pb-3 space-y-1.5">
            {[
              { label: "Severity", value: (
                <span className={clsx("text-[9px] font-black px-1.5 py-0.5 rounded", sevCfg.bg, sevCfg.text)}>
                  {incident.severity} · {sevCfg.label}
                </span>
              )},
              { label: "Status", value: (
                <select
                  value={incident.status}
                  onChange={e => updateIncident.mutate({ status: e.target.value })}
                  className="text-[10px] border-0 bg-transparent cursor-pointer focus:outline-none text-slate-700 font-semibold capitalize"
                >
                  {STATUS_STEPS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              )},
              { label: "Affected", value: <span className="text-[10px] font-bold text-rose-600">{incident.affected_accounts.toLocaleString()} accounts</span> },
              { label: "Owner",    value: <span className="text-[10px] text-slate-700">{incident.owner_name ?? "Unassigned"}</span> },
              { label: "Created",  value: <span className="text-[10px] text-slate-700">{format(new Date(incident.created_at), "MMM d, yyyy h:mm aa")}</span> },
              { label: "Duration", value: <span className="text-[10px] font-mono text-slate-700">{fmtDuration(parseFloat(String(incident.duration_sec)))}</span> },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-[10px] text-slate-400 flex-shrink-0">{row.label}</span>
                <div className="text-right">{row.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Affected Services */}
        {incident.services?.length > 0 && (
          <div className="border-b border-slate-100">
            <div className="px-4 py-3">
              <h3 className="text-xs font-bold text-slate-700 mb-2">Affected Services</h3>
              <div className="flex flex-wrap gap-1">
                {incident.services.map(s => (
                  <span key={s} className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-semibold">{s}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tasks */}
        <div className="border-b border-slate-100">
          <div className="px-4 py-3 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700">Incident Tasks</h3>
            <button onClick={() => setShowAddTask(a => !a)} className="text-[10px] text-indigo-600 font-bold flex items-center gap-0.5 hover:underline">
              <Plus size={9} /> Add
            </button>
          </div>
          <div className="px-4 pb-3 space-y-1.5">
            {showAddTask && (
              <div className="mb-2 space-y-1.5">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && newTaskTitle.trim()) addTask.mutate(); if (e.key === "Escape") setShowAddTask(false); }}
                  placeholder="Task description…"
                  autoFocus
                  className="w-full text-xs border border-indigo-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 bg-indigo-50"
                />
                <div className="flex gap-1 justify-end">
                  <button onClick={() => setShowAddTask(false)} className="text-[10px] text-slate-500 px-2 py-1 rounded hover:bg-slate-50">Cancel</button>
                  <button onClick={() => newTaskTitle.trim() && addTask.mutate()} disabled={!newTaskTitle.trim() || addTask.isPending}
                    className="text-[10px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg font-semibold transition">
                    Add
                  </button>
                </div>
              </div>
            )}
            {tasks.map(task => (
              <div key={task.id} className="flex items-start gap-2 group">
                <button
                  onClick={() => toggleTask.mutate({ taskId: task.id, status: task.status === "completed" ? "open" : "completed" })}
                  className={clsx("w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition",
                    task.status === "completed" ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-emerald-400")}
                >
                  {task.status === "completed" && <Check size={9} className="text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={clsx("text-[11px] leading-snug", task.status === "completed" ? "line-through text-slate-400" : "text-slate-700")}>
                    {task.title}
                  </p>
                  {task.assigned_to_name && (
                    <p className="text-[9px] text-slate-400">{task.assigned_to_name}</p>
                  )}
                </div>
              </div>
            ))}
            {tasks.length === 0 && !showAddTask && (
              <p className="text-[10px] text-slate-400 italic text-center py-1">No tasks yet</p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-700 mb-2">Quick Actions</h3>
            <div className="space-y-1.5">
              {[
                { label: "Mark as Identified",  onClick: () => updateIncident.mutate({ status: "identified" }),  hidden: incident.status !== "investigating" },
                { label: "Start Monitoring",     onClick: () => updateIncident.mutate({ status: "monitoring" }),  hidden: incident.status !== "identified" },
                { label: "Resolve Incident",     onClick: () => updateIncident.mutate({ status: "resolved" }),    hidden: isResolved },
                { label: "Re-open Incident",     onClick: () => updateIncident.mutate({ status: "investigating" }), hidden: !isResolved },
              ].filter(a => !a.hidden).map(a => (
                <button key={a.label} onClick={a.onClick}
                  className="w-full text-left px-3 py-2 text-[11px] font-semibold text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition border border-slate-100 hover:border-indigo-200">
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
