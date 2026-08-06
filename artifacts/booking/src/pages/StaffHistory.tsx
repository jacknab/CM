import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StaffPortalNav } from "@/components/StaffPortalNav";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Scissors,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  History,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type HistoryAppointment = {
  id: number;
  date: string;
  duration: number;
  status: string | null;
  totalPaid: string | null;
  tipAmount: string | null;
  paymentMethod: string | null;
  notes: string | null;
  clientName: string | null;
  serviceName: string | null;
  servicePrice: string | null;
};

type HistoryResponse = {
  appointments: HistoryAppointment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: "all",       label: "All Past",  statuses: "completed,no-show,no_show,cancelled" },
  { key: "completed", label: "Completed", statuses: "completed" },
  { key: "noshow",    label: "No-Show",   statuses: "no-show,no_show" },
  { key: "cancelled", label: "Cancelled", statuses: "cancelled" },
] as const;

type TabKey = typeof STATUS_TABS[number]["key"];

function statusBadge(status: string | null) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
          <CheckCircle2 className="w-3 h-3" /> Done
        </span>
      );
    case "no-show":
    case "no_show":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
          <Clock className="w-3 h-3" /> No-Show
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600">
          <XCircle className="w-3 h-3" /> Cancelled
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
          {status ?? "—"}
        </span>
      );
  }
}

function formatDuration(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmt$(val: string | null | undefined) {
  const n = parseFloat(val ?? "0");
  return isNaN(n) ? "$0.00" : `$${n.toFixed(2)}`;
}

// ── Appointment card ──────────────────────────────────────────────────────────

function ApptCard({ appt }: { appt: HistoryAppointment }) {
  const date = new Date(appt.date);
  const dayStr  = format(date, "EEE, MMM d");
  const timeStr = format(date, "h:mm a");
  const hasTip  = parseFloat(appt.tipAmount ?? "0") > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5 flex flex-col gap-2">
      {/* Row 1: date + status */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-slate-800">
          {dayStr} <span className="font-normal text-slate-400">· {timeStr}</span>
        </span>
        {statusBadge(appt.status)}
      </div>

      {/* Row 2: client + service */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 min-w-0">
          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-[12px] text-slate-600 truncate">
            {appt.clientName ?? "Walk-in"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Scissors className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-[12px] text-slate-600 truncate">
            {appt.serviceName ?? "Service"}
          </span>
        </div>
      </div>

      {/* Row 3: duration + amount */}
      <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-slate-50">
        <span className="text-[11px] text-slate-400">
          {formatDuration(appt.duration)}
          {appt.paymentMethod && (
            <> · <span className="capitalize">{appt.paymentMethod.replace("_", " ")}</span></>
          )}
        </span>
        <div className="flex items-center gap-2">
          {hasTip && (
            <span className="text-[11px] text-teal-600 font-medium">
              +{fmt$(appt.tipAmount)} tip
            </span>
          )}
          <span className="text-[13px] font-bold text-slate-800">
            {fmt$(appt.totalPaid || appt.servicePrice)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function SummaryStrip({ appointments }: { appointments: HistoryAppointment[] }) {
  const totalEarned = appointments.reduce((acc, a) => acc + parseFloat(a.totalPaid ?? "0"), 0);
  const totalTips   = appointments.reduce((acc, a) => acc + parseFloat(a.tipAmount ?? "0"), 0);
  const completed   = appointments.filter(a => a.status === "completed").length;

  return (
    <div className="mx-4 mb-3 bg-teal-500 rounded-2xl px-4 py-3 flex items-center justify-between">
      <div className="text-center">
        <p className="text-teal-100 text-[10px] font-medium uppercase tracking-wide">This page</p>
        <p className="text-white font-extrabold text-[16px]">{completed}</p>
        <p className="text-teal-100 text-[10px]">Completed</p>
      </div>
      <div className="w-px h-8 bg-teal-400" />
      <div className="text-center">
        <p className="text-teal-100 text-[10px] font-medium uppercase tracking-wide">Earned</p>
        <p className="text-white font-extrabold text-[16px]">${totalEarned.toFixed(2)}</p>
        <p className="text-teal-100 text-[10px]">Revenue</p>
      </div>
      <div className="w-px h-8 bg-teal-400" />
      <div className="text-center">
        <p className="text-teal-100 text-[10px] font-medium uppercase tracking-wide">Tips</p>
        <p className="text-white font-extrabold text-[16px]">${totalTips.toFixed(2)}</p>
        <p className="text-teal-100 text-[10px]">Total</p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function StaffHistory() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab]   = useState<TabKey>("all");
  const [page, setPage]             = useState(1);

  const tabDef = STATUS_TABS.find(t => t.key === activeTab)!;

  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ["/api/staff/me/history", tabDef.statuses, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: tabDef.statuses,
        page:   String(page),
        limit:  String(PAGE_SIZE),
      });
      const res = await fetch(`/api/staff/me/history?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
    staleTime: 60_000,
  });

  const appts      = data?.appointments ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;
  const total      = pagination?.total ?? 0;

  function switchTab(key: TabKey) {
    setActiveTab(key);
    setPage(1);
  }

  return (
    <div className="flex flex-col bg-[#f8f8fb] overflow-hidden" style={{ height: "100dvh" }}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-slate-100 px-4 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center active:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
              <History className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h1 className="text-[17px] font-extrabold text-slate-900 leading-tight">
                Service History
              </h1>
              {total > 0 && (
                <p className="text-[11px] text-slate-400">
                  {total} appointment{total !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors",
                activeTab === tab.key
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 text-slate-500 active:bg-slate-200",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">

        {/* Summary strip */}
        {appts.length > 0 && (
          <div className="pt-4">
            <SummaryStrip appointments={appts} />
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-3 px-4 pt-4">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-slate-100 h-[88px] animate-pulse"
              />
            ))}
          </div>
        ) : appts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-8">
            <div className="w-16 h-16 rounded-full bg-violet-50 flex items-center justify-center">
              <DollarSign className="w-7 h-7 text-violet-300" />
            </div>
            <p className="text-[15px] font-bold text-slate-700 text-center">No appointments here yet</p>
            <p className="text-[12px] text-slate-400 text-center">
              {activeTab === "all"
                ? "Your completed, cancelled, and no-show appointments will appear here."
                : `No ${STATUS_TABS.find(t => t.key === activeTab)?.label.toLowerCase()} appointments found.`}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-4 pt-2 pb-4">
            {appts.map((appt) => (
              <ApptCard key={appt.id} appt={appt} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 py-4 px-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center disabled:opacity-40 active:bg-slate-50"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <span className="text-[13px] font-semibold text-slate-600">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center disabled:opacity-40 active:bg-slate-50"
            >
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        )}
      </main>

      {/* ── Bottom nav ───────────────────────────────────────────────────────── */}
      <StaffPortalNav />
    </div>
  );
}
