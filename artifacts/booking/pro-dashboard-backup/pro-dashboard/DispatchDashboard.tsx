import { useContext, useRef, useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StoreContext } from "@/hooks/use-store";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Filter, Clock, CalendarDays, Zap } from "lucide-react";

// ─── Grid constants ──────────────────────────────────────────────────────────
const TIME_COL_W = 56;
const CREW_COL_W = 152;
const DAY_START = 6;   // 6 am
const DAY_END   = 21;  // 9 pm
const SLOT_H    = 68;  // px per hour
const TOTAL_H   = (DAY_END - DAY_START) * SLOT_H;
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtHour(h: number) {
  if (h === 0 || h === 24) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function fmtRange(scheduledAt: string, estHours: number | null) {
  const s = new Date(scheduledAt);
  const sh = s.getHours(), sm = s.getMinutes();
  const durH = estHours ?? 1;
  const totalMin = sh * 60 + sm + durH * 60;
  const eh = Math.floor(totalMin / 60) % 24, em = totalMin % 60;
  const f = (h: number, m: number) => {
    const suffix = h < 12 ? "a" : "p";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
  };
  return `${f(sh, sm)} - ${f(eh, em)}`;
}

function jobTopPx(scheduledAt: string) {
  const d = new Date(scheduledAt);
  const fromStart = (d.getHours() - DAY_START) + d.getMinutes() / 60;
  return Math.max(0, fromStart * SLOT_H);
}

function jobHeightPx(estHours: number | null) {
  return Math.max((estHours ?? 1) * SLOT_H - 4, 28);
}

// ─── Status palette ───────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { bg: string; border: string; label: string; text: string }> = {
  new:         { bg: "rgba(59,130,246,0.18)",  border: "#3b82f6", label: "#93c5fd", text: "#bfdbfe" },
  assigned:    { bg: "rgba(59,130,246,0.28)",  border: "#3b82f6", label: "#dbeafe", text: "#eff6ff" },
  en_route:    { bg: "rgba(245,158,11,0.22)",  border: "#f59e0b", label: "#fde68a", text: "#fef3c7" },
  in_progress: { bg: "rgba(0,212,170,0.22)",   border: "#00D4AA", label: "#a7f3d0", text: "#d1fae5" },
  completed:   { bg: "rgba(34,197,94,0.18)",   border: "#22c55e", label: "#86efac", text: "#dcfce7" },
  cancelled:   { bg: "rgba(239,68,68,0.14)",   border: "#ef4444", label: "#fca5a5", text: "#fee2e2" },
};

// ─── Job card ─────────────────────────────────────────────────────────────────
function JobCard({ job, navigate }: { job: any; navigate: (path: string) => void }) {
  if (!job.scheduledAt) return null;
  const top = jobTopPx(job.scheduledAt);
  const height = jobHeightPx(Number(job.estimatedHours) || null);
  const s = STATUS_STYLE[job.status] ?? STATUS_STYLE.new;
  const isUrgent = job.priority === "urgent" || job.priority === "emergency";

  return (
    <button
      onClick={() => navigate(`/pro-dashboard/jobs/${job.id}`)}
      className="absolute text-left rounded-lg overflow-hidden group transition-all hover:scale-[1.02] hover:z-20"
      style={{ top: top + 2, height, left: 4, right: 4, background: s.bg, borderLeft: `3px solid ${s.border}` }}
    >
      <div className="px-2 pt-1.5 pb-1 h-full flex flex-col">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[10px] font-bold leading-none" style={{ color: s.label }}>
            {job.orderNumber}
          </span>
          {isUrgent && <Zap className="w-2.5 h-2.5 flex-shrink-0" style={{ color: "#f59e0b" }} />}
        </div>
        <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: s.text }}>
          {job.serviceType}
        </p>
        {height > 44 && (
          <p className="text-[10px] leading-tight mt-0.5 truncate" style={{ color: s.text, opacity: 0.7 }}>
            {job.customerName}
          </p>
        )}
        {height > 58 && (
          <p className="text-[9px] mt-auto" style={{ color: s.label, opacity: 0.8 }}>
            {fmtRange(job.scheduledAt, Number(job.estimatedHours) || null)}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Crew column ──────────────────────────────────────────────────────────────
function CrewColumn({ crew, jobs, navigate, isLast }: { crew: any; jobs: any[]; navigate: (s: string) => void; isLast: boolean }) {
  return (
    <div className="relative border-l border-white/6 flex-shrink-0" style={{ width: CREW_COL_W }}>
      {/* Hourly grid lines */}
      {HOURS.map((_, i) => (
        <div key={i} className="absolute left-0 right-0 border-t border-white/[0.06]" style={{ top: i * SLOT_H }} />
      ))}
      {/* Half-hour dashes */}
      {HOURS.map((_, i) => (
        <div key={`h${i}`} className="absolute left-0 right-0 border-t border-dashed border-white/[0.03]"
          style={{ top: i * SLOT_H + SLOT_H / 2 }} />
      ))}
      {/* Job cards */}
      {jobs.map(job => <JobCard key={job.id} job={job} navigate={navigate} />)}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DispatchDashboard() {
  const ctx = useContext(StoreContext);
  const storeId = ctx?.selectedStore?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef   = useRef<HTMLDivElement>(null);

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [nowTime, setNowTime] = useState(() => new Date());
  const [filter, setFilter] = useState("All");

  // Refresh current time every 30s
  useEffect(() => {
    const t = setInterval(() => setNowTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Sync crew header horizontal scroll with grid body
  const onBodyScroll = useCallback(() => {
    if (headerRef.current && bodyRef.current) {
      headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/pro-dashboard/dispatch", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/pro-dashboard/dispatch?storeId=${storeId}`);
      return r.json();
    },
    enabled: !!storeId,
  });

  // WS push: invalidate when any booking event fires; 60s fallback timer
  useEffect(() => {
    if (!storeId) return;
    const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/pro-dashboard/dispatch", storeId] });
    window.addEventListener("sync-event", invalidate);
    const fallback = setInterval(invalidate, 60_000);
    return () => {
      window.removeEventListener("sync-event", invalidate);
      clearInterval(fallback);
    };
  }, [storeId, qc]);

  const simulateLocation = useMutation({
    mutationFn: async (crewId: number) => {
      const baseLats = [40.7128, 34.0522, 41.8781, 29.7604, 33.4484];
      const baseLngs = [-74.006, -118.2437, -87.6298, -95.3698, -112.074];
      const i = crewId % baseLats.length;
      await fetch(`/api/pro-dashboard/crews/${crewId}/location`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: baseLats[i] + (Math.random() - 0.5) * 0.08, lng: baseLngs[i] + (Math.random() - 0.5) * 0.12 }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/pro-dashboard/dispatch", storeId] }),
  });

  const allOrders = data?.orders ?? [];
  const crewList  = data?.crews ?? [];

  // Filter to selected date
  const dateStr = selectedDate.toDateString();
  const dayOrders = allOrders.filter((o: any) => {
    if (!o.scheduledAt) return filter === "Unassigned"; // show unscheduled in unassigned filter
    return new Date(o.scheduledAt).toDateString() === dateStr;
  });

  const filteredOrders =
    filter === "All"        ? dayOrders :
    filter === "Urgent"     ? dayOrders.filter((o: any) => ["urgent","emergency"].includes(o.priority)) :
    filter === "Unassigned" ? allOrders.filter((o: any) => !o.crewId && !["completed","cancelled"].includes(o.status)) :
    filter === "Active"     ? dayOrders.filter((o: any) => ["assigned","en_route","in_progress"].includes(o.status)) :
    dayOrders;

  const jobsFor = (crewId: number | null) =>
    filteredOrders.filter((o: any) => crewId === null ? !o.crewId : o.crewId === crewId);

  const unassigned = jobsFor(null);
  const showUnassigned = filter === "Unassigned" || unassigned.length > 0;

  // Current time indicator
  const nowH = nowTime.getHours(), nowM = nowTime.getMinutes();
  const nowOffsetH = (nowH - DAY_START) + nowM / 60;
  const nowPx = nowOffsetH * SLOT_H;
  const showNowLine = nowTime.toDateString() === dateStr && nowOffsetH >= 0 && nowOffsetH <= (DAY_END - DAY_START);

  // Date label
  const dateLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });

  const prevDay  = () => setSelectedDate(d => new Date(d.getTime() - 86400000));
  const nextDay  = () => setSelectedDate(d => new Date(d.getTime() + 86400000));
  const goToday  = () => setSelectedDate(new Date());

  const totalCols = crewList.length + (showUnassigned ? 1 : 0);
  const gridMinW  = TIME_COL_W + totalCols * CREW_COL_W;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#060E1A]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-white/8 bg-[#0A1628] flex-wrap gap-y-2 flex-shrink-0">
        <h1 className="text-white font-extrabold text-lg mr-1">Dispatch</h1>

        <Link to="/pro-dashboard/jobs/new"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00D4AA] text-[#050C18] text-xs font-bold rounded-lg hover:bg-[#00C49A] transition-all">
          <Plus className="w-3.5 h-3.5" /> Create Job
        </Link>

        <button className="flex items-center gap-1.5 px-3 py-1.5 border border-white/20 text-white/60 text-xs font-semibold rounded-lg hover:border-[#00D4AA]/40 hover:text-[#00D4AA] transition-all">
          <Clock className="w-3.5 h-3.5" /> Add Time Off
        </button>

        {/* Date nav */}
        <div className="flex items-center bg-white/5 border border-white/10 rounded-lg overflow-hidden ml-1">
          <button onClick={prevDay} className="px-2 py-1.5 text-white/50 hover:text-white hover:bg-white/8 transition-all">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5 px-3">
            <CalendarDays className="w-3.5 h-3.5 text-white/40" />
            <span className="text-white text-xs font-semibold whitespace-nowrap">{dateLabel}</span>
          </div>
          <button onClick={nextDay} className="px-2 py-1.5 text-white/50 hover:text-white hover:bg-white/8 transition-all">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button onClick={goToday}
          className="px-3 py-1.5 border border-white/20 text-white/70 text-xs font-semibold rounded-lg hover:bg-white/6 transition-all">
          Today
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-white/30 text-xs">Dispatch View:</span>
          <select className="bg-[#0D1F35] border border-white/15 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#00D4AA]/50 cursor-pointer">
            <option>Day view</option>
            <option>Week view</option>
          </select>
        </div>
      </div>

      {/* ── Filter chips ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/8 bg-[#0A1628] flex-shrink-0">
        <Filter className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
        <span className="text-white/30 text-xs flex-shrink-0">Queue filters:</span>
        {["All", "Active", "Urgent", "Unassigned"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border transition-all flex-shrink-0 ${
              filter === f
                ? "bg-[#00D4AA]/15 border-[#00D4AA]/50 text-[#00D4AA]"
                : "border-white/12 text-white/40 hover:border-white/25 hover:text-white/65"
            }`}>
            {f}
          </button>
        ))}
        <span className="ml-auto text-white/25 text-xs whitespace-nowrap">
          {filteredOrders.length} job{filteredOrders.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Crew header (syncs with grid scroll) ───────────────────────────── */}
      <div className="bg-[#0A1628] border-b border-white/8 overflow-hidden flex-shrink-0" ref={headerRef}>
        <div className="flex" style={{ minWidth: gridMinW }}>
          {/* Time col spacer */}
          <div className="flex-shrink-0 border-r border-white/6" style={{ width: TIME_COL_W }} />

          {crewList.map((crew: any) => {
            const crewJobs = jobsFor(crew.id).length;
            const isOnline = !!crew.location;
            return (
              <div key={crew.id} className="flex flex-col items-center py-3 border-l border-white/6 flex-shrink-0"
                style={{ width: CREW_COL_W }}>
                <div className="relative">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-white border-2 shadow-md"
                    style={{ background: crew.color + "33", borderColor: crew.color }}>
                    {crew.name[0]}
                  </div>
                  {isOnline && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#00D4AA] border border-[#0A1628]" />
                  )}
                </div>
                <p className="text-white/80 text-[11px] font-semibold mt-1.5 truncate px-2 max-w-full">
                  {crew.name}
                </p>
                <p className={`text-[10px] ${crewJobs > 0 ? "text-[#00D4AA]" : "text-white/25"}`}>
                  {crewJobs > 0 ? `${crewJobs} job${crewJobs > 1 ? "s" : ""}` : "Available"}
                </p>
              </div>
            );
          })}

          {/* Unassigned column header */}
          {showUnassigned && (
            <div className="flex flex-col items-center py-3 border-l border-dashed border-white/10 flex-shrink-0"
              style={{ width: CREW_COL_W }}>
              <div className="w-9 h-9 rounded-full bg-white/8 border-2 border-dashed border-white/20 flex items-center justify-center text-white/40 font-bold text-sm">
                ?
              </div>
              <p className="text-white/40 text-[11px] font-semibold mt-1.5">Unassigned</p>
              <p className="text-[10px] text-white/25">{unassigned.length} job{unassigned.length !== 1 ? "s" : ""}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Scrollable time grid ─────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Loading dispatch data…</div>
      ) : (
        <div className="flex-1 overflow-auto" ref={bodyRef} onScroll={onBodyScroll}>
          <div className="relative flex" style={{ height: TOTAL_H, minWidth: gridMinW }}>

            {/* ── Time labels (sticky left) ─────────────────────── */}
            <div className="sticky left-0 z-20 bg-[#060E1A] border-r border-white/6 flex-shrink-0"
              style={{ width: TIME_COL_W }}>
              {HOURS.map((h, i) => (
                <div key={h} className="absolute w-full flex items-start justify-end pr-2.5 pt-1.5"
                  style={{ top: i * SLOT_H, height: SLOT_H }}>
                  <span className="text-[11px] font-semibold text-white/25">{fmtHour(h)}</span>
                </div>
              ))}
            </div>

            {/* ── Crew columns ─────────────────────────────────── */}
            {crewList.map((crew: any, idx: number) => (
              <CrewColumn
                key={crew.id}
                crew={crew}
                jobs={jobsFor(crew.id)}
                navigate={navigate}
                isLast={idx === crewList.length - 1 && !showUnassigned}
              />
            ))}

            {/* ── Unassigned column ─────────────────────────────── */}
            {showUnassigned && (
              <div className="relative border-l border-dashed border-white/8 flex-shrink-0"
                style={{ width: CREW_COL_W }}>
                {HOURS.map((_, i) => (
                  <div key={i} className="absolute left-0 right-0 border-t border-white/[0.04]"
                    style={{ top: i * SLOT_H }} />
                ))}
                {unassigned.map((job: any) => <JobCard key={job.id} job={job} navigate={navigate} />)}
              </div>
            )}

            {/* ── Current time indicator ───────────────────────── */}
            {showNowLine && (
              <div className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                style={{ top: nowPx }}>
                <div className="flex-shrink-0 flex justify-end items-center pr-1.5"
                  style={{ width: TIME_COL_W }}>
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />
                </div>
                <div className="flex-1 h-px bg-red-500 opacity-80" />
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────────── */}
      {!isLoading && crewList.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-white/20 text-sm font-semibold">No crews yet</p>
          <Link to="/pro-dashboard/crews" className="text-[#00D4AA] text-xs mt-1 pointer-events-auto hover:underline">
            Add your first crew →
          </Link>
        </div>
      )}
    </div>
  );
}
