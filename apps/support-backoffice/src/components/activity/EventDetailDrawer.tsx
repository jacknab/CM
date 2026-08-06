import { useEffect, useRef } from "react";
import { X, Clock, Tag, User, AlertCircle, Info, AlertTriangle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { clsx } from "clsx";
import type { ActivityEvent } from "@/lib/api";

interface Props {
  event: ActivityEvent | null;
  onClose: () => void;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  appointment:    { label: "Appointment",    color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  sms:            { label: "SMS",            color: "bg-violet-100 text-violet-700 border-violet-200" },
  ai_receptionist:{ label: "AI Receptionist",color: "bg-sky-100 text-sky-700 border-sky-200" },
  billing:        { label: "Billing",        color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  support:        { label: "Support",        color: "bg-amber-100 text-amber-700 border-amber-200" },
  authentication: { label: "Authentication", color: "bg-orange-100 text-orange-700 border-orange-200" },
  website:        { label: "Website",        color: "bg-teal-100 text-teal-700 border-teal-200" },
  users:          { label: "Users",          color: "bg-rose-100 text-rose-700 border-rose-200" },
  subscription:   { label: "Subscription",  color: "bg-purple-100 text-purple-700 border-purple-200" },
  email:          { label: "Email",          color: "bg-blue-100 text-blue-700 border-blue-200" },
};

function SeverityBadge({ severity }: { severity?: string }) {
  if (!severity || severity === "info") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
      <Info size={9} /> Info
    </span>
  );
  if (severity === "warning") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
      <AlertTriangle size={9} /> Warning
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200">
      <AlertCircle size={9} /> Critical
    </span>
  );
}

function MetadataViewer({ metadata }: { metadata: any }) {
  if (!metadata) return <p className="text-xs text-slate-400 italic">No metadata</p>;
  const entries = Object.entries(metadata).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return <p className="text-xs text-slate-400 italic">No metadata</p>;

  return (
    <div className="space-y-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-start gap-2">
          <span className="text-[10px] text-slate-400 font-mono w-28 flex-shrink-0 pt-0.5">
            {key.replace(/([A-Z])/g, " $1").toLowerCase()}
          </span>
          <span className="text-xs text-slate-700 font-mono break-all flex-1">
            {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function EventDetailDrawer({ event, onClose }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (event) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [event, onClose]);

  if (!event) return null;

  const catCfg = CATEGORY_CONFIG[event.category] ?? { label: event.category, color: "bg-slate-100 text-slate-700 border-slate-200" };
  const ts = new Date(event.occurred_at);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200 bg-slate-50">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={clsx("text-[10px] font-semibold px-2 py-0.5 rounded-full border", catCfg.color)}>
                {catCfg.label}
              </span>
              <SeverityBadge severity={(event as any).severity} />
            </div>
            <h2 className="text-sm font-semibold text-slate-800 leading-snug">{event.title}</h2>
            {event.subtitle && (
              <p className="text-xs text-slate-500 mt-0.5">{event.subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition flex-shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-5">

          {/* Event ID + Timestamp */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Tag size={13} className="text-slate-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Event ID</p>
                <p className="text-xs font-mono text-slate-700 mt-0.5">{event.id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-slate-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Timestamp</p>
                <p className="text-xs text-slate-700 mt-0.5">{format(ts, "EEEE, MMMM d yyyy")} at {format(ts, "h:mm:ss aa")}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{ts.toISOString()}</p>
              </div>
            </div>
          </div>

          {/* Actor */}
          {((event as any).actor_name || (event as any).actor_type) && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Actor</p>
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <User size={14} className="text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{(event as any).actor_name || "System"}</p>
                  <p className="text-[10px] text-slate-500 capitalize">{((event as any).actor_type ?? "system").replace(/_/g, " ")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Event Details</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <MetadataViewer metadata={event.metadata} />
            </div>
          </div>

          {/* Raw JSON */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Raw Metadata JSON</p>
            <div className="bg-[#0f172a] rounded-xl p-4 overflow-x-auto">
              <pre className="text-[10px] text-emerald-400 font-mono whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(event.metadata ?? {}, null, 2)}
              </pre>
            </div>
          </div>

          {/* Full event JSON */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Full Event Record</p>
            <div className="bg-[#0f172a] rounded-xl p-4 overflow-x-auto">
              <pre className="text-[10px] text-sky-300 font-mono whitespace-pre-wrap leading-relaxed">
                {JSON.stringify({
                  id: event.id,
                  category: event.category,
                  title: event.title,
                  subtitle: event.subtitle,
                  occurred_at: event.occurred_at,
                  actor_name: (event as any).actor_name,
                  actor_type: (event as any).actor_type,
                  severity: (event as any).severity,
                }, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <p className="text-[10px] text-slate-400 text-center">
            Press <kbd className="bg-white border border-slate-200 rounded px-1 font-mono">Esc</kbd> to close · Click outside to dismiss
          </p>
        </div>
      </div>
    </>
  );
}
