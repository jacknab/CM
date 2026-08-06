import { useContext, useRef, useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StoreContext } from "@/hooks/use-store";
import { useNavigate, Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Clock, Zap, X } from "lucide-react";

// ─── Grid constants ───────────────────────────────────────────────────────────
const DAY_START = 6;
const DAY_END   = 21;
const SLOT_H    = 72; // px per hour
const TIME_COL_W = 52;
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
const TOTAL_H = (DAY_END - DAY_START) * SLOT_H;

const COL_WIDTHS: Record<string, number> = { S: 100, M: 148, L: 200 };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtHour(h: number) {
  if (h === 12) return "12p";
  if (h === 0 || h === 24) return "12a";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function fmtTime(date: Date) {
  const h = date.getHours(), m = date.getMinutes();
  const suffix = h < 12 ? "a" : "p";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

function fmtRange(scheduledAt: string, estHours: number | null) {
  const s = new Date(scheduledAt);
  const dur = (estHours ?? 1) * 60;
  const e = new Date(s.getTime() + dur * 60000);
  return `${fmtTime(s)} – ${fmtTime(e)}`;
}

function jobTop(scheduledAt: string) {
  const d = new Date(scheduledAt);
  return Math.max(0, ((d.getHours() - DAY_START) + d.getMinutes() / 60) * SLOT_H);
}

function jobHeight(estHours: number | null) {
  return Math.max((estHours ?? 1) * SLOT_H - 6, 26);
}

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Status styles ────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { bg: string; border: string; label: string; text: string }> = {
  new:         { bg: "rgba(59,130,246,0.13)",  border: "#3b82f6", label: "#93c5fd", text: "#bfdbfe" },
  assigned:    { bg: "rgba(99,102,241,0.18)",  border: "#6366f1", label: "#c7d2fe", text: "#e0e7ff" },
  en_route:    { bg: "rgba(245,158,11,0.18)",  border: "#f59e0b", label: "#fde68a", text: "#fef3c7" },
  in_progress: { bg: "rgba(0,212,170,0.20)",   border: "#00D4AA", label: "#a7f3d0", text: "#d1fae5" },
  completed:   { bg: "rgba(34,197,94,0.15)",   border: "#22c55e", label: "#86efac", text: "#dcfce7" },
  cancelled:   { bg: "rgba(239,68,68,0.12)",   border: "#ef4444", label: "#fca5a5", text: "#fee2e2" },
};
const STATUS_LABEL: Record<string, string> = {
  new: "New", assigned: "Assigned", en_route: "En Route",
  in_progress: "In Progress", completed: "Done", cancelled: "Cancelled",
};

// ─── Slot popup ───────────────────────────────────────────────────────────────
function SlotPopup({ crew, hour, minute, colW, onClose, navigate }: {
  crew: any; hour: number; minute: number; colW: number; onClose: () => void; navigate: (p: string) => void;
}) {
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const suffix = hour < 12 ? "am" : "pm";
  const mStr = minute === 0 ? "00" : String(minute);
  const timeLabel = `${h12}:${mStr} ${suffix}`;

  const scheduledISO = (() => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  })();

  return (
    <div className="absolute z-30 bg-[#0D1F35] border border-[#00D4AA]/40 rounded-xl shadow-2xl p-3 w-44"
      style={{ top: jobTop(`${new Date().toISOString().split("T")[0]}T${String(hour).padStart(2,"0")}:${mStr}:00`) + 2, left: colW + 4 }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-[#00D4AA]" />
          <span className="text-white text-xs font-bold">{timeLabel}</span>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/60">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-white/50 text-[10px] mb-3 leading-relaxed">
        Schedule a job for <span className="text-white/80 font-semibold">{crew.name}</span>
      </p>
      <button
        onClick={() => {
          navigate(`/pro-dashboard/jobs/new?crewId=${crew.id}&scheduledAt=${encodeURIComponent(scheduledISO)}`);
          onClose();
        }}
        className="w-full py-1.5 rounded-lg bg-[#00D4AA] text-[#050C18] text-xs font-bold hover:bg-[#00D4AA]/90 transition-colors"
      >
        New Job Here
      </button>
    </div>
  );
}

// ─── Job card ─────────────────────────────────────────────────────────────────
function JobCard({ job, colW, navigate }: { job: any; colW: number; navigate: (p: string) => void }) {
  if (!job.scheduledAt) return null;
  const top = jobTop(job.scheduledAt);
  const h = jobHeight(Number(job.estimatedHours) || null);
  const s = STATUS_STYLE[job.status] ?? STATUS_STYLE.new;
  const isUrgent = ["urgent", "emergency"].includes(job.priority);

  return (
    <button
      onClick={() => navigate(`/pro-dashboard/jobs/${job.id}`)}
      className="absolute text-left rounded-lg overflow-hidden transition-all hover:scale-[1.02] hover:z-10 group"
      style={{ top: top + 2, height: h, left: 4, right: 4, background: s.bg, borderLeft: `3px solid ${s.border}` }}
    >
      <div className="px-2 pt-1.5 pb-1 h-full flex flex-col">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[10px] font-bold leading-none" style={{ color: s.label }}>
            {job.orderNumber}
          </span>
          {isUrgent && <Zap className="w-2.5 h-2.5 flex-shrink-0 text-amber-400" />}
        </div>
        {h > 36 && (
          <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: s.text }}>
            {job.serviceType}
          </p>
        )}
        {h > 54 && (
          <p className="text-[10px] leading-tight truncate mt-0.5" style={{ color: s.text, opacity: 0.7 }}>
            {job.customerName}
          </p>
        )}
        {h > 72 && (
          <p className="text-[9px] mt-auto" style={{ color: s.label, opacity: 0.8 }}>
            {fmtRange(job.scheduledAt, Number(job.estimatedHours) || null)}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Crew column ──────────────────────────────────────────────────────────────
function CrewColumn({ crew, jobs, colW, navigate, showNowLine, nowPx, selectedDate }: any) {
  const [popup, setPopup] = useState<{ hour: number; minute: number } | null>(null);

  const handleSlotClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const totalMins = (relY / SLOT_H) * 60 + DAY_START * 60;
    const hour = Math.floor(totalMins / 60);
    const minute = Math.round((totalMins % 60) / 15) * 15;
    setPopup({ hour: Math.max(DAY_START, Math.min(DAY_END - 1, hour)), minute: minute >= 60 ? 45 : minute });
  };

  return (
    <div
      className="relative border-l border-white/[0.07] flex-shrink-0 cursor-pointer"
      style={{ width: colW, height: TOTAL_H }}
      onClick={handleSlotClick}
    >
      {/* Hourly lines */}
      {HOURS.map((_, i) => (
        <div key={i} className="absolute left-0 right-0 border-t border-white/[0.07]" style={{ top: i * SLOT_H }} />
      ))}
      {/* Half-hour dashes */}
      {HOURS.map((_, i) => (
        <div key={`h${i}`} className="absolute left-0 right-0 border-t border-dashed border-white/[0.035]"
          style={{ top: i * SLOT_H + SLOT_H / 2 }} />
      ))}
      {/* Now line */}
      {showNowLine && (
        <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: nowPx }}>
          <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-red-500 -translate-y-1.5" />
          <div className="h-px bg-red-500" />
        </div>
      )}
      {/* Job cards */}
      {jobs.map((job: any) => (
        <JobCard key={job.id} job={job} colW={colW} navigate={navigate} />
      ))}
      {/* Slot popup */}
      {popup && (
        <SlotPopup
          crew={crew}
          hour={popup.hour}
          minute={popup.minute}
          colW={colW}
          onClose={() => setPopup(null)}
          navigate={navigate}
        />
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SchedulePage() {
  const ctx = useContext(StoreContext);
  const storeId = ctx?.selectedStore?.id;
  const navigate = useNavigate();

  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef   = useRef<HTMLDivElement>(null);

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [colSize, setColSize] = useState<"S" | "M" | "L">("M");
  const [nowTime, setNowTime] = useState(() => new Date());

  const COL_W = COL_WIDTHS[colSize];

  useEffect(() => {
    const t = setInterval(() => setNowTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Sync header scroll with body
  const onBodyScroll = useCallback(() => {
    if (headerRef.current && bodyRef.current) {
      headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
    }
  }, []);

  const { data: crewData = [], isLoading: crewLoading } = useQuery({
    queryKey: ["/api/pro-dashboard/crews", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/pro-dashboard/crews?storeId=${storeId}`);
      return r.json();
    },
    enabled: !!storeId,
  });

  const { data: ordersData = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["/api/pro-dashboard/orders", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/pro-dashboard/orders?storeId=${storeId}`);
      return r.json();
    },
    enabled: !!storeId,
    refetchInterval: 60000,
  });

  const crews: any[] = crewData.filter((c: any) => c.active !== false);
  const dateStr = selectedDate.toDateString();

  // Filter orders to the selected date
  const dayOrders = (ordersData as any[]).filter((o: any) => {
    if (!o.scheduledAt) return false;
    return new Date(o.scheduledAt).toDateString() === dateStr;
  });

  const jobsFor = (crewId: number) =>
    dayOrders.filter((o: any) => o.crewId === crewId);

  const unscheduled = (ordersData as any[]).filter((o: any) =>
    !o.scheduledAt && !["completed", "cancelled"].includes(o.status)
  );

  // Now indicator
  const isTodaySelected = selectedDate.toDateString() === new Date().toDateString();
  const nowH = nowTime.getHours(), nowM = nowTime.getMinutes();
  const nowOffset = (nowH - DAY_START) + nowM / 60;
  const nowPx = nowOffset * SLOT_H;
  const showNowLine = isTodaySelected && nowOffset >= 0 && nowOffset <= (DAY_END - DAY_START);

  // Date labels
  const dateLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });

  const goToday  = () => setSelectedDate(new Date());
  const prevDay  = () => setSelectedDate(d => new Date(d.getTime() - 86400000));
  const nextDay  = () => setSelectedDate(d => new Date(d.getTime() + 86400000));

  const isLoading = crewLoading || ordersLoading;

  return (
    <div
      className="flex flex-col h-full bg-[#060E1A] overflow-hidden select-none"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-[#0A1628] flex-shrink-0 flex-wrap">

        {/* New Job */}
        <Link to="/pro-dashboard/jobs/new">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00D4AA] text-[#050C18] text-xs font-bold hover:bg-[#00D4AA]/90 transition-colors flex-shrink-0">
            <Plus className="w-3.5 h-3.5" />
            New Job
          </button>
        </Link>

        <div className="w-px h-5 bg-white/10 flex-shrink-0" />

        {/* Date navigation */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={prevDay} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 cursor-default">
            <CalendarDays className="w-3.5 h-3.5 text-white/40" />
            <span className="text-white/80 text-xs font-semibold min-w-[160px] text-center">{dateLabel}</span>
          </div>
          <button onClick={nextDay} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={goToday}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex-shrink-0 ${
              isTodaySelected
                ? "bg-[#00D4AA]/15 text-[#00D4AA] border border-[#00D4AA]/30"
                : "border border-white/15 text-white/60 hover:text-white hover:bg-white/8"
            }`}
          >
            Today
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Column size */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {(["S", "M", "L"] as const).map(sz => (
            <button
              key={sz}
              onClick={() => setColSize(sz)}
              className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                colSize === sz
                  ? "bg-[#00D4AA]/20 text-[#00D4AA] border border-[#00D4AA]/30"
                  : "text-white/40 hover:text-white/70 hover:bg-white/8"
              }`}
            >
              {sz}
            </button>
          ))}
        </div>
      </div>

      {/* ── Calendar grid ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Crew header + grid body stacked */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Sticky crew header row */}
          <div className="flex border-b border-white/10 bg-[#0A1628] flex-shrink-0 overflow-hidden">
            {/* Time gutter placeholder */}
            <div className="flex-shrink-0 bg-[#0A1628] border-r border-white/10" style={{ width: TIME_COL_W }} />
            {/* Scrollable crew header */}
            <div ref={headerRef} className="flex overflow-x-hidden">
              {crews.map((crew: any) => (
                <div
                  key={crew.id}
                  className="flex flex-col items-center justify-center py-3 border-l border-white/[0.07] flex-shrink-0 gap-1.5"
                  style={{ width: COL_W }}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-lg ring-2 ring-black/20"
                    style={{ background: crew.color || "#00D4AA" }}
                  >
                    {initials(crew.name)}
                  </div>
                  <div className="text-center">
                    <p className="text-white/80 text-xs font-semibold leading-tight truncate px-1" style={{ maxWidth: COL_W - 8 }}>
                      {crew.name}
                    </p>
                    <p className="text-white/30 text-[10px]">
                      {jobsFor(crew.id).length} job{jobsFor(crew.id).length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scrollable grid body */}
          <div
            ref={bodyRef}
            onScroll={onBodyScroll}
            className="flex flex-1 overflow-auto"
          >
            {/* Time column */}
            <div className="flex-shrink-0 bg-[#060E1A] border-r border-white/10 sticky left-0 z-10" style={{ width: TIME_COL_W, height: TOTAL_H }}>
              {HOURS.map((h, i) => (
                <div
                  key={h}
                  className="absolute flex items-start justify-end pr-2 pt-0.5"
                  style={{ top: i * SLOT_H, height: SLOT_H, width: TIME_COL_W }}
                >
                  <span className="text-white/30 text-[11px] font-medium leading-none">{fmtHour(h)}</span>
                </div>
              ))}
            </div>

            {/* Crew columns */}
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center" style={{ height: TOTAL_H }}>
                <div className="text-white/30 text-sm">Loading schedule…</div>
              </div>
            ) : crews.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ height: TOTAL_H }}>
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
                  <CalendarDays className="w-7 h-7 text-white/20" />
                </div>
                <div className="text-center">
                  <p className="text-white/50 font-semibold text-sm">No crew members yet</p>
                  <p className="text-white/30 text-xs mt-1">Add crew in the Crews section first</p>
                </div>
                <Link to="/pro-dashboard/crews">
                  <button className="px-4 py-2 rounded-lg bg-[#00D4AA]/15 text-[#00D4AA] text-xs font-bold border border-[#00D4AA]/20 hover:bg-[#00D4AA]/25 transition-colors">
                    Manage Crew
                  </button>
                </Link>
              </div>
            ) : (
              <div className="flex relative" style={{ height: TOTAL_H }}>
                {crews.map((crew: any) => (
                  <CrewColumn
                    key={crew.id}
                    crew={crew}
                    jobs={jobsFor(crew.id)}
                    colW={COL_W}
                    navigate={navigate}
                    showNowLine={showNowLine}
                    nowPx={nowPx}
                    selectedDate={selectedDate}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: unscheduled ── */}
        {unscheduled.length > 0 && (
          <div className="w-60 flex-shrink-0 border-l border-white/10 bg-[#0A1628] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Unscheduled</p>
              <span className="text-white/40 text-xs font-semibold bg-white/8 px-2 py-0.5 rounded-full">
                {unscheduled.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {unscheduled.map((job: any) => {
                const s = STATUS_STYLE[job.status] ?? STATUS_STYLE.new;
                return (
                  <Link key={job.id} to={`/pro-dashboard/jobs/${job.id}`}>
                    <div className="rounded-xl p-3 cursor-pointer hover:opacity-90 transition-opacity border"
                      style={{ background: s.bg, borderColor: s.border + "40" }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold" style={{ color: s.label }}>{job.orderNumber}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                          style={{ background: s.border + "25", color: s.label }}>
                          {STATUS_LABEL[job.status]}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold truncate" style={{ color: s.text }}>{job.serviceType}</p>
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: s.text, opacity: 0.7 }}>{job.customerName}</p>
                      {job.priority === "emergency" && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span className="text-amber-400 text-[10px] font-bold">Emergency</span>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
