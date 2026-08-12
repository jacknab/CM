import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLanguage } from "@/hooks/use-language";
import {
  ArrowLeft,
  Phone,
  PhoneCall,
  PhoneIncoming,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Settings,
  User,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Scissors,
  MessageSquare,
} from "lucide-react";

interface CallTranscriptTurn {
  role: "caller" | "autumn";
  text: string;
  ts: string;
}

interface CallLog {
  id: number;
  callSid: string | null;
  callerPhone: string | null;
  callerName: string | null;
  outcome: string;
  durationSeconds: number | null;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  appointmentId: number | null;
  serviceName: string | null;
  transcript: CallTranscriptTurn[] | null;
  recordingSid?: string | null;
  recordingUrl?: string | null;
}

interface CallLogsResponse {
  logs: CallLog[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
}

interface ReceptionistSettings {
  enabled: boolean;
  provisionedPhoneNumber: string | null;
  twilioConfigured: boolean;
  apiKeyConfigured: boolean;
  phoneProvisioned: boolean;
}

function formatPhone(raw: string | null): string {
  if (!raw) return "Unknown";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type OutcomeKey = "booked" | "rescheduled" | "cancelled" | "callback_required" | "completed" | "in_progress" | "failed" | "error" | string;

const OUTCOME_CONFIG: Record<string, { label: string; classes: string; Icon: React.ElementType }> = {
  booked:            { label: "Booked",      classes: "bg-emerald-100 text-emerald-700", Icon: CheckCircle },
  rescheduled:       { label: "Rescheduled", classes: "bg-blue-100 text-blue-700",       Icon: RefreshCw   },
  cancelled:         { label: "Cancelled",   classes: "bg-amber-100 text-amber-700",     Icon: XCircle     },
  callback_required: { label: "Callback",    classes: "bg-orange-100 text-orange-700",   Icon: Phone       },
  completed:         { label: "Completed",   classes: "bg-teal-100 text-teal-700",       Icon: CheckCircle },
  in_progress:       { label: "In Progress", classes: "bg-slate-100 text-slate-600",     Icon: PhoneIncoming},
  failed:            { label: "Failed",      classes: "bg-rose-100 text-rose-600",       Icon: XCircle     },
  error:             { label: "Error",       classes: "bg-rose-100 text-rose-600",       Icon: XCircle     },
};

function OutcomeBadge({ outcome }: { outcome: OutcomeKey }) {
  const cfg = OUTCOME_CONFIG[outcome] ?? { label: outcome.replace(/_/g, " "), classes: "bg-slate-100 text-slate-600", Icon: Phone };
  const { label, classes, Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${classes}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function StatCard({ icon: Icon, iconBg, iconColor, value, label }: { icon: React.ElementType; iconBg: string; iconColor: string; value: string | number; label: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

function PaginationControls({ page, totalPages, total, pageSize, onPageChange }: { page: number; totalPages: number; total: number; pageSize: number; onPageChange: (p: number) => void }) {
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);
  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 bg-slate-50 border-slate-100">
      <span className="text-xs text-slate-500">
        {total === 0 ? "No calls" : `${from}–${to} of ${total.toLocaleString()} call${total !== 1 ? "s" : ""}`}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="w-7 h-7 flex items-center justify-center text-xs text-slate-400">…</span>
          ) : (
            <button key={p} onClick={() => onPageChange(p)} className={`w-7 h-7 rounded-md text-xs font-semibold transition-colors ${p === page ? "bg-rose-500 text-white" : "text-slate-600 hover:bg-slate-200"}`}>{p}</button>
          )
        )}
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

async function fetchCallLogs(page: number): Promise<CallLogsResponse> {
  const res = await fetch(`/api/ai-receptionist/call-logs?page=${page}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load call logs");
  return res.json();
}

async function fetchSettings(): Promise<ReceptionistSettings> {
  const res = await fetch("/api/ai-receptionist/settings", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

async function updateReceptionistEnabled(enabled: boolean): Promise<ReceptionistSettings> {
  const res = await fetch("/api/ai-receptionist/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Failed to update AI Receptionist state");
  }
  const next = await res.json();
  return { enabled: !!next.enabled, provisionedPhoneNumber: null, twilioConfigured: true, apiKeyConfigured: true, phoneProvisioned: !!next.phoneProvisioned };
}

export default function AiReceptionistCallLogs() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { pick } = useLanguage();
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const t = {
    backToDashboard:  pick({ en: "Back to Dashboard",          vi: "Về tổng quan",              es: "Volver al panel",              fr: "Retour au tableau de bord" }),
    title:            pick({ en: "Autumn — Call History",      vi: "Autumn — Lịch sử cuộc gọi", es: "Autumn — Historial de llamadas", fr: "Autumn — Historique des appels" }),
    live:             pick({ en: "● Live",                     vi: "● Trực tiếp",               es: "● En vivo",                    fr: "● En ligne" }),
    paused:           pick({ en: "○ Paused",                   vi: "○ Tạm dừng",                es: "○ En pausa",                   fr: "○ En pause" }),
    liveBtn:          pick({ en: "LIVE",                       vi: "TRỰC TIẾP",                 es: "EN VIVO",                      fr: "EN LIGNE" }),
    disabledBtn:      pick({ en: "DISABLED",                   vi: "TẮT",                       es: "DESACTIVADO",                  fr: "DÉSACTIVÉ" }),
    refresh:          pick({ en: "Refresh",                    vi: "Làm mới",                   es: "Actualizar",                   fr: "Actualiser" }),
    manageNumber:     pick({ en: "Manage Number",              vi: "Quản lý số",                es: "Gestionar número",             fr: "Gérer le numéro" }),
    totalCalls:       pick({ en: "Total Calls",                vi: "Tổng cuộc gọi",             es: "Total de llamadas",            fr: "Total des appels" }),
    avgDuration:      pick({ en: "Avg Duration (this page)",   vi: "Thời lượng TB (trang này)", es: "Duración promedio (esta página)", fr: "Durée moy. (cette page)" }),
    bookings:         pick({ en: "Bookings (this page)",       vi: "Đặt lịch (trang này)",      es: "Reservas (esta página)",       fr: "Réservations (cette page)" }),
    callbacks:        pick({ en: "Callbacks (this page)",      vi: "Gọi lại (trang này)",       es: "Devoluciones (esta página)",   fr: "Rappels (cette page)" }),
    colCaller:        pick({ en: "Caller",                     vi: "Người gọi",                 es: "Llamante",                    fr: "Appelant" }),
    colService:       pick({ en: "Service Booked",             vi: "Dịch vụ đặt",               es: "Servicio reservado",           fr: "Service réservé" }),
    colOutcome:       pick({ en: "Outcome",                    vi: "Kết quả",                   es: "Resultado",                   fr: "Résultat" }),
    colDuration:      pick({ en: "Duration",                   vi: "Thời lượng",                es: "Duración",                    fr: "Durée" }),
    colTime:          pick({ en: "Time",                       vi: "Thời gian",                 es: "Hora",                        fr: "Heure" }),
    noCalls:          pick({ en: "No calls yet",               vi: "Chưa có cuộc gọi",          es: "Sin llamadas todavía",         fr: "Aucun appel pour l'instant" }),
    noCallsDesc:      pick({ en: "Autumn will log every call here once she starts receiving them.", vi: "Autumn sẽ ghi lại mọi cuộc gọi ở đây khi bắt đầu nhận.", es: "Autumn registrará cada llamada aquí una vez que empiece a recibirlas.", fr: "Autumn enregistrera chaque appel ici dès qu'elle commencera à en recevoir." }),
    labelDate:        pick({ en: "Date",                       vi: "Ngày",                      es: "Fecha",                       fr: "Date" }),
    labelTime:        pick({ en: "Time",                       vi: "Giờ",                       es: "Hora",                        fr: "Heure" }),
    labelDuration:    pick({ en: "Duration",                   vi: "Thời lượng",                es: "Duración",                    fr: "Durée" }),
    labelAppointment: pick({ en: "Appointment",                vi: "Lịch hẹn",                  es: "Cita",                        fr: "Rendez-vous" }),
    labelServiceBooked: pick({ en: "Service Booked",           vi: "Dịch vụ đặt",               es: "Servicio reservado",          fr: "Service réservé" }),
    labelNotes:       pick({ en: "Notes",                      vi: "Ghi chú",                   es: "Notas",                       fr: "Notes" }),
    labelTranscript:  pick({ en: "Transcript",                 vi: "Bản ghi",                   es: "Transcripción",               fr: "Transcription" }),
    labelCaller:      pick({ en: "Caller",                     vi: "Người gọi",                 es: "Llamante",                    fr: "Appelant" }),
    labelAutumn:      pick({ en: "Autumn",                     vi: "Autumn",                    es: "Autumn",                      fr: "Autumn" }),
  };

  const { data, isLoading: logsLoading, refetch, isFetching } = useQuery<CallLogsResponse>({
    queryKey: ["/api/ai-receptionist/call-logs", page],
    queryFn: () => fetchCallLogs(page),
    refetchInterval: 60_000,
  });

  const { data: settings } = useQuery<ReceptionistSettings>({
    queryKey: ["/api/ai-receptionist/settings"],
    queryFn: fetchSettings,
    staleTime: 30_000,
  });

  const toggleLive = useMutation({
    mutationFn: updateReceptionistEnabled,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/ai-receptionist/settings"] }); },
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const pageSize = data?.pageSize ?? 50;

  const completedCalls = logs.filter((l) => l.durationSeconds && l.durationSeconds > 0);
  const avgDuration = completedCalls.length > 0
    ? Math.round(completedCalls.reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0) / completedCalls.length)
    : null;
  const bookingsOnPage = logs.filter((l) => l.outcome === "booked").length;
  const callbacksOnPage = logs.filter((l) => l.outcome === "callback_required").length;

  function goToPage(p: number) {
    const clamped = Math.max(1, Math.min(totalPages, p));
    setPage(clamped);
    setExpandedId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (logsLoading) {
    return (
      <AppLayout>
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-rose-400" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto pb-16">
        <button onClick={() => navigate("/manage")} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {t.backToDashboard}
        </button>

        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
              <PhoneCall className="w-5 h-5 text-rose-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{t.title}</h1>
              {settings?.provisionedPhoneNumber && (
                <p className="text-sm text-slate-500 mt-0.5">
                  {formatPhone(settings.provisionedPhoneNumber)}
                  <span className={`ml-2 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${settings.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {settings.enabled ? t.live : t.paused}
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (!settings) return; toggleLive.mutate(!settings.enabled); }}
              disabled={!settings || toggleLive.isPending}
              data-testid="button-toggle-ai-receptionist-live"
              className={`px-4 py-2 text-sm font-extrabold uppercase tracking-wide border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${settings?.enabled ? "bg-[#39ff14] text-black border-[#39ff14] shadow-[0_0_18px_rgba(57,255,20,0.65)] hover:brightness-95" : "bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-300"}`}
            >
              {settings?.enabled ? t.liveBtn : t.disabledBtn}
            </button>
            <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              {t.refresh}
            </button>
            <button onClick={() => navigate("/manage/ai-receptionist/setup")} className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <Settings className="w-4 h-4" />
              {t.manageNumber}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard icon={PhoneIncoming} iconBg="bg-rose-100" iconColor="text-rose-500" value={total} label={t.totalCalls} />
          <StatCard icon={Clock} iconBg="bg-blue-100" iconColor="text-blue-500" value={avgDuration !== null ? formatDuration(avgDuration) : "—"} label={t.avgDuration} />
          <StatCard icon={CheckCircle} iconBg="bg-emerald-100" iconColor="text-emerald-500" value={bookingsOnPage} label={t.bookings} />
          <StatCard icon={AlertTriangle} iconBg="bg-orange-100" iconColor="text-orange-500" value={callbacksOnPage} label={t.callbacks} />
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {total > 0 && (
            <div className="border-b border-slate-100">
              <PaginationControls page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={goToPage} />
            </div>
          )}

          <div className="grid grid-cols-[1fr_minmax(120px,auto)_auto_auto_auto] gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-400">
            <span>{t.colCaller}</span>
            <span>{t.colService}</span>
            <span className="text-right">{t.colOutcome}</span>
            <span className="text-right">{t.colDuration}</span>
            <span className="text-right">{t.colTime}</span>
          </div>

          {logs.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
                <Phone className="w-7 h-7 text-rose-300" />
              </div>
              <p className="text-slate-500 font-medium">{t.noCalls}</p>
              <p className="text-slate-400 text-sm mt-1">{t.noCallsDesc}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;
                return (
                  <div key={log.id}>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="w-full grid grid-cols-[1fr_minmax(120px,auto)_auto_auto_auto] gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left items-center"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{log.callerName || formatPhone(log.callerPhone)}</p>
                          {log.callerName && log.callerPhone && (
                            <p className="text-xs text-slate-400 truncate">{formatPhone(log.callerPhone)}</p>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        {log.serviceName ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full truncate max-w-[160px]">
                            <Scissors className="w-3 h-3 shrink-0" />
                            <span className="truncate">{log.serviceName}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </div>
                      <OutcomeBadge outcome={log.outcome} />
                      <span className="text-sm text-slate-600 tabular-nums text-right whitespace-nowrap">{formatDuration(log.durationSeconds)}</span>
                      <div className="flex items-center gap-2 text-right">
                        <div><p className="text-xs text-slate-500 whitespace-nowrap">{formatRelativeTime(log.startedAt)}</p></div>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5 bg-slate-50 border-t border-slate-100">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 text-sm">
                          <div><p className="text-xs text-slate-400 mb-0.5">{t.labelDate}</p><p className="font-medium text-slate-700">{formatDate(log.startedAt)}</p></div>
                          <div><p className="text-xs text-slate-400 mb-0.5">{t.labelTime}</p><p className="font-medium text-slate-700">{formatTime(log.startedAt)}</p></div>
                          <div><p className="text-xs text-slate-400 mb-0.5">{t.labelDuration}</p><p className="font-medium text-slate-700">{formatDuration(log.durationSeconds)}</p></div>
                          {log.appointmentId && (
                            <div><p className="text-xs text-slate-400 mb-0.5">{t.labelAppointment}</p><p className="font-medium text-slate-700">#{log.appointmentId}</p></div>
                          )}
                          {log.serviceName && (
                            <div><p className="text-xs text-slate-400 mb-0.5">{t.labelServiceBooked}</p><p className="font-medium text-slate-700">{log.serviceName}</p></div>
                          )}
                        </div>

                        {log.notes && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <p className="text-xs text-slate-400 mb-1">{t.labelNotes}</p>
                            <p className="text-sm text-slate-600">{log.notes}</p>
                          </div>
                        )}

                        {log.recordingUrl && (
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            <p className="text-xs text-slate-400 mb-1">Recording</p>
                            <audio controls className="w-full rounded-xl bg-slate-900/5 p-2">
                              <source src={`/api/ai-receptionist/recording/${log.id}`} type="audio/mpeg" />
                              Your browser does not support audio playback.
                            </audio>
                          </div>
                        )}
                        {log.transcript && log.transcript.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            <div className="flex items-center gap-2 mb-3">
                              <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t.labelTranscript}</p>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {log.transcript.map((turn, i) => (
                                <div key={i} className={`flex gap-2 ${turn.role === "caller" ? "flex-row-reverse" : ""}`}>
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold ${turn.role === "caller" ? "bg-teal-100 text-teal-700" : "bg-rose-100 text-rose-600"}`}>
                                    {turn.role === "caller" ? t.labelCaller.slice(0, 1) : "A"}
                                  </div>
                                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${turn.role === "caller" ? "bg-teal-50 text-teal-900 rounded-tr-sm" : "bg-white border border-slate-100 text-slate-700 rounded-tl-sm"}`}>
                                    {turn.text}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {total > pageSize && (
            <div className="border-t border-slate-100">
              <PaginationControls page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={goToPage} />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
