import { useRef, useEffect, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { WeeklyAgendaView } from "@/components/WeeklyAgendaView";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { addMinutes } from "date-fns";
import { formatInTz, formatStoreDate, getDayOfWeekInTz, addStoreDays } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { isStaffDateSelectable, isStaffSlotBookable } from "@/lib/staffCalendarDatePolicy";
import { Plus, Check, CalendarPlus, Search, Clock, Play, CheckCircle2, XCircle, ChevronLeft, ChevronRight, CalendarDays, ListFilter, LayoutList, ListOrdered } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { useNotifications } from "@/hooks/use-notifications";
import { usePendingSyncMap } from "@/hooks/use-pending-sync";
import { AppointmentSyncBadge } from "@/components/AppointmentSyncBadge";

const TIME_COL_W = 68;
const STAFF_HEADER_H = 60;

interface WeekDay {
  date: Date;
  label: string;
  isToday: boolean;
}

interface MobileCalendarViewProps {
  filteredStaff: any[];
  timeSlots: { hour: number; minute: number; label: string; isHour: boolean }[];
  START_HOUR: number;
  END_HOUR: number;
  TOTAL_HOURS: number;
  HOUR_HEIGHT: number;
  getAppointmentsForStaff: (staffId: number) => any[];
  getAppointmentStyle: (apt: any) => { top: string; height: string };
  getStaffColor: (member: any) => string;
  timezone: string;
  selectedAppointment: any | null;
  onSelectAppointment: (apt: any) => void;
  handleSlotClick: (staffId: number, hour: number, minute: number) => void;
  selectedSlot: { staffId: number; hour: number; minute: number } | null;
  setSelectedSlot: (slot: null) => void;
  handleBookSlot: (staffId: number, hour: number, minute: number) => void;
  isToday: boolean;
  isPastDate: boolean;
  timeLinePosition: number | null;
  timeLineLabel: string;
  showPrices: boolean;
  lateGracePeriodMinutes: number;
  storeNow: Date;
  settings: { timeSlotInterval: number };
  weekDayLabels: WeekDay[];
  currentDate: Date;
  onSelectDate: (date: Date) => void;
  onNewBooking: () => void;
  onLookup: () => void;
  selectedStaffId: number | "all";
  onFilterStaff: (staffId: number | "all") => void;
  onQuickStart: (apt: any) => void;
  onQuickComplete: (apt: any) => void;
  onQuickCancel: (apt: any) => void;
  goToday: () => void;
  onOpenDatePicker: () => void;
  calView: "grid" | "agenda";
  onToggleCalView: () => void;
  staffList: any[];
  isStaffUser: boolean;
  tToday: string;
  tAllStaff: string;
  allStaffAvailability: { staffId: number; dayOfWeek: number; startTime: string; endTime: string }[];
  turnSystem?: boolean;
  showTurnPanel?: boolean;
  onToggleTurnPanel?: () => void;
  myTurnPos?: number | null;
  turnEligibility?: { technicians?: { clockedIn?: boolean }[] };
  currentStaffId?: number;
  businessStartMin: number;
  businessEndMin: number;
  businessIsClosed: boolean;
  /** All appointments for the current week — used by the agenda view */
  weekAppointments?: any[];
}

function useColsPerPage(staffCount: number) {
  const getIsLandscape = () =>
    typeof window !== "undefined" && window.innerWidth > window.innerHeight;

  const [isLandscape, setIsLandscape] = useState(getIsLandscape);

  useEffect(() => {
    const update = () => setIsLandscape(getIsLandscape());
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  if (staffCount === 1) return 1;
  if (!isLandscape || staffCount <= 2) return 2;
  const w = typeof window !== "undefined" ? window.innerWidth : 400;
  if (w >= 700) return Math.min(staffCount, 5);
  if (w >= 580) return Math.min(staffCount, 4);
  if (w >= 460) return Math.min(staffCount, 3);
  return 2;
}

export function MobileCalendarView({
  filteredStaff,
  timeSlots,
  START_HOUR,
  END_HOUR,
  TOTAL_HOURS,
  HOUR_HEIGHT,
  getAppointmentsForStaff,
  getAppointmentStyle,
  getStaffColor,
  timezone,
  selectedAppointment,
  onSelectAppointment,
  handleSlotClick,
  selectedSlot,
  setSelectedSlot,
  handleBookSlot,
  isToday,
  isPastDate,
  timeLinePosition,
  timeLineLabel,
  showPrices,
  lateGracePeriodMinutes,
  storeNow,
  goToday,
  onOpenDatePicker,
  calView,
  onToggleCalView,
  staffList,
  isStaffUser,
  tToday,
  tAllStaff,
  allStaffAvailability,
  settings,
  weekDayLabels,
  currentDate,
  onSelectDate,
  onNewBooking,
  onLookup,
  selectedStaffId,
  onFilterStaff,
  onQuickStart,
  onQuickComplete,
  onQuickCancel,
  turnSystem,
  showTurnPanel,
  onToggleTurnPanel,
  myTurnPos,
  turnEligibility,
  currentStaffId,
  businessStartMin,
  businessEndMin,
  businessIsClosed,
  weekAppointments,
}: MobileCalendarViewProps) {
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [quickActionApt, setQuickActionApt] = useState<any | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const didAutoScrollRef = useRef(false);
  const weekStripTouchRef = useRef<{ x: number; y: number } | null>(null);

  const [staffPage, setStaffPage] = useState(0);
  const [swipeDir, setSwipeDir] = useState<1 | -1>(1);
  const [showJumpToNow, setShowJumpToNow] = useState(false);
  const programmaticScrollRef = useRef(false);
  const { unreadCount } = useNotifications(
    currentStaffId ? { staffPortalFilter: { staffId: currentStaffId } } : undefined
  );
  const prevShakeControls = useAnimation();

  const triggerPrevShake = useCallback(() => {
    prevShakeControls.start({
      x: [0, -5, 5, -5, 5, -3, 3, 0],
      transition: { duration: 0.4, ease: "easeInOut" },
    });
  }, [prevShakeControls]);

  const COLS_PER_PAGE = useColsPerPage(filteredStaff.length);
  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / COLS_PER_PAGE));
  const safeStaffPage = Math.min(staffPage, totalPages - 1);
  const visibleStaff = filteredStaff.slice(safeStaffPage * COLS_PER_PAGE, (safeStaffPage + 1) * COLS_PER_PAGE);

  const totalGridH = TOTAL_HOURS * HOUR_HEIGHT;

  useEffect(() => {
    setStaffPage(0);
  }, [filteredStaff.length, COLS_PER_PAGE]);

  const scrollToNow = useCallback(() => {
    if (!gridRef.current || timeLinePosition === null) return;
    const target = Math.max(0, timeLinePosition - gridRef.current.clientHeight / 3);
    programmaticScrollRef.current = true;
    gridRef.current.scrollTo({ top: target, behavior: "smooth" });
  }, [timeLinePosition]);

  useEffect(() => {
    if (!isToday || timeLinePosition === null || didAutoScrollRef.current) return;
    didAutoScrollRef.current = true;
    const id = setTimeout(scrollToNow, 80);
    return () => clearTimeout(id);
  }, [isToday, timeLinePosition, scrollToNow]);

  useEffect(() => {
    didAutoScrollRef.current = false;
  }, [currentDate]);

  useEffect(() => {
    const el = gridRef.current;
    if (!el || !isToday || timeLinePosition === null) {
      setShowJumpToNow(false);
      return;
    }
    const check = () => {
      // Skip visibility evaluation during programmatic scrolls (auto-scroll to
      // current time on load). Without this, scrollTop=0 at mount makes the
      // timeline look off-screen and the NOW button appears prematurely.
      if (programmaticScrollRef.current) {
        programmaticScrollRef.current = false;
        return;
      }
      const { scrollTop, clientHeight } = el;
      const visible = timeLinePosition >= scrollTop && timeLinePosition <= scrollTop + clientHeight;
      setShowJumpToNow(!visible);
    };
    // Delay the initial check until after the 80ms auto-scroll has settled.
    // If auto-scroll fires, the scroll event triggers check() which clears
    // programmaticScrollRef and returns early. The delayed check then runs
    // once the scroll position is stable.
    const initialId = setTimeout(check, 200);
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      clearTimeout(initialId);
      el.removeEventListener("scroll", check);
    };
  }, [isToday, timeLinePosition]);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0 && safeStaffPage < totalPages - 1) {
        setSwipeDir(1);
        setStaffPage((p) => p + 1);
      } else if (dx > 0 && safeStaffPage > 0) {
        setSwipeDir(-1);
        setStaffPage((p) => Math.max(0, p - 1));
      }
    }
  };

  if (filteredStaff.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm py-20">
        No staff members found.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">

      {/* ── Date header ── */}
      <div
        className="flex-shrink-0 h-16 flex items-center gap-1 px-2 bg-white border-b border-gray-100"
        onTouchStart={(e) => {
          const t = e.touches[0];
          weekStripTouchRef.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          if (!weekStripTouchRef.current) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - weekStripTouchRef.current.x;
          const dy = t.clientY - weekStripTouchRef.current.y;
          weekStripTouchRef.current = null;
          if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          // Block rightward swipe (go to previous day) when already on today — shake the prev button
          if (dx > 0 && isToday) { triggerPrevShake(); return; }
          const nextDate = addStoreDays(currentDate, dx < 0 ? 1 : -1);
          if (!isStaffUser || isStaffDateSelectable(nextDate, storeNow)) onSelectDate(nextDate);
        }}
      >
        {/* Left: Today button (when not today, with unread badge) or NotificationBell */}
        {!isToday ? (
          <button
            onClick={goToday}
            className="relative h-8 px-3 flex items-center justify-center rounded-full bg-teal-500 text-white text-xs font-semibold active:bg-teal-600 transition-colors shrink-0"
            data-testid="button-go-today"
          >
            {tToday}
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-violet-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        ) : (
          <NotificationBell mobile staffPortalFilter={currentStaffId ? { staffId: currentStaffId } : undefined} />
        )}

        {/* Center: prev / date (tappable → date picker) / next */}
        <div className="flex flex-1 items-center justify-center gap-0.5">
          <motion.button
            animate={prevShakeControls}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-full transition-colors",
              isToday ? "opacity-30" : "active:bg-gray-100"
            )}
            onClick={isToday
              ? triggerPrevShake
              : () => {
                const previousDate = addStoreDays(currentDate, -1);
                if (!isStaffUser || isStaffDateSelectable(previousDate, storeNow)) onSelectDate(previousDate);
              }}
            aria-label="Previous day"
            aria-disabled={isToday}
          >
            <ChevronLeft size={18} className="text-slate-500" />
          </motion.button>
          <button
            className="flex items-center gap-1 px-1 active:opacity-70 transition-opacity"
            onClick={onOpenDatePicker}
            data-testid="button-current-date"
          >
            <span className="text-[13px] font-bold text-slate-700 tabular-nums tracking-tight">
              {formatStoreDate(currentDate, "EEE d MMM, yyyy")}
            </span>
          </button>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100 transition-colors"
            onClick={() => {
              const nextDate = addStoreDays(currentDate, 1);
              if (!isStaffUser || isStaffDateSelectable(nextDate, storeNow)) onSelectDate(nextDate);
            }}
            aria-label="Next day"
          >
            <ChevronRight size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Staff filter */}
        {!isStaffUser ? (
          <Select
            value={selectedStaffId === "all" ? "all" : String(selectedStaffId)}
            onValueChange={(val) => onFilterStaff(val === "all" ? "all" : Number(val))}
          >
            <SelectTrigger
              className="w-9 h-9 border-0 shadow-none px-0 bg-transparent [&>svg]:hidden text-slate-400 data-[state=open]:text-slate-700 shrink-0"
              data-testid="select-staff-filter"
            >
              <div className="relative flex items-center justify-center">
                <ListFilter size={18} />
                {selectedStaffId !== "all" && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-pink-300" />
                )}
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tAllStaff}</SelectItem>
              {staffList?.map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="w-9 shrink-0" />
        )}

        {/* View toggle: grid ↔ agenda */}
        <button
          onClick={onToggleCalView}
          className="w-9 h-9 flex items-center justify-center rounded-full active:opacity-60 transition-opacity shrink-0"
          aria-label={calView === "grid" ? "Switch to agenda view" : "Switch to grid view"}
        >
          {calView === "grid"
            ? <LayoutList size={18} className="text-slate-400" />
            : <CalendarDays size={18} className="text-teal-500" />
          }
        </button>

        {/* TURN queue toggle — only shown when Turn System is enabled */}
        {turnSystem && (
          <button
            className={cn(
              "relative w-9 h-9 flex items-center justify-center rounded-full transition-colors shrink-0",
              showTurnPanel
                ? "bg-slate-800 text-white"
                : "text-slate-400 active:opacity-60"
            )}
            onClick={onToggleTurnPanel}
            aria-label="Toggle turn queue"
          >
            <ListOrdered size={18} />
            {myTurnPos != null && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] bg-teal-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none px-0.5 pointer-events-none">
                {myTurnPos}
              </span>
            )}
            {myTurnPos == null && !showTurnPanel && (turnEligibility?.technicians ?? []).filter(t => t.clockedIn).length > 0 && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-teal-400 pointer-events-none" />
            )}
          </button>
        )}
      </div>

      {/* ── Agenda (week-list) view ── */}
      {calView === "agenda" && (
        <WeeklyAgendaView
          appointments={weekAppointments ?? []}
          staffList={staffList}
          timezone={timezone}
          weekDayLabels={weekDayLabels}
          currentDate={currentDate}
          onSelectAppointment={onSelectAppointment}
          onNewBooking={onNewBooking}
          getStaffColor={getStaffColor}
          selectedAppointment={selectedAppointment}
        hidePastDates={isStaffUser}
        />
      )}

      {/* ── Staff headers row (owner/admin only) — hidden in agenda view ── */}
      {!isStaffUser && calView !== "agenda" && (
      <div className="flex-shrink-0 bg-card border-b flex overflow-hidden" style={{ height: STAFF_HEADER_H }}>
        {/* Corner: page dots + left overflow badge */}
        <div
          className="flex-shrink-0 flex flex-col items-center justify-center gap-1.5"
          style={{ width: TIME_COL_W }}
        >
          {totalPages > 1 && (
            <div className="flex flex-col gap-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setSwipeDir(i > safeStaffPage ? 1 : -1); setStaffPage(i); }}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all",
                    i === safeStaffPage ? "bg-primary scale-125" : "bg-muted-foreground/25"
                  )}
                />
              ))}
            </div>
          )}
          {/* Left overflow badge — shows count of staff hidden to the left */}
          {safeStaffPage > 0 && (
            <button
              onClick={() => { setSwipeDir(-1); setStaffPage(p => Math.max(0, p - 1)); }}
              className="flex items-center gap-[2px] px-1.5 py-0.5 rounded-full bg-primary/10 active:bg-primary/20 transition-colors"
              aria-label="Previous staff"
            >
              <ChevronLeft size={10} className="text-primary shrink-0" />
              <span className="text-[9px] font-extrabold text-primary leading-none">
                {safeStaffPage * COLS_PER_PAGE}
              </span>
            </button>
          )}
        </div>

        {/* Staff header cells — name pill + Add Shift */}
        <AnimatePresence mode="wait" custom={swipeDir}>
          <motion.div
            key={`hdr-${safeStaffPage}-${COLS_PER_PAGE}`}
            custom={swipeDir}
            initial={((dir: number) => ({ x: dir * 40, opacity: 0 })) as any}
            animate={{ x: 0, opacity: 1 }}
            exit={((dir: number) => ({ x: -dir * 40, opacity: 0 })) as any}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="flex flex-1"
          >
            {visibleStaff.map((member: any) => {
              const color = getStaffColor(member);
              const isFiltered = selectedStaffId === member.id;
              return (
                <button
                  key={member.id}
                  className="flex-1 flex flex-col items-center justify-center py-0.5 gap-1 active:opacity-70 transition-opacity"
                  style={{
                    minWidth: 0,
                    backgroundColor: isFiltered ? color + "12" : undefined,
                  }}
                  onClick={() => onFilterStaff(isFiltered ? "all" : member.id)}
                >
                  <span
                    className="px-2 py-[2px] rounded-full text-[11px] font-bold text-slate-800 leading-tight truncate max-w-full"
                    style={{
                      backgroundColor: color + "18",
                      border: `1.5px solid ${color}55`,
                    }}
                  >
                    {member.name}
                  </span>
                  {(() => {
                    // Use store timezone so the day-of-week matches the salon's
                    // wall-clock date, not the browser device's local date.
                    const todayDow = getDayOfWeekInTz(currentDate, timezone);
                    const rule = allStaffAvailability?.find(
                      (r) => r.staffId === member.id && r.dayOfWeek === todayDow
                    );
                    if (rule) {
                      const fmt = (t: string) => {
                        const [h, m] = t.split(":").map(Number);
                        const ampm = h >= 12 ? "pm" : "am";
                        const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
                        return m === 0 ? `${hr}${ampm}` : `${hr}:${String(m).padStart(2, "0")}${ampm}`;
                      };
                      return (
                        <span className="text-[9px] text-slate-400 leading-none">
                          {fmt(rule.startTime)}–{fmt(rule.endTime)}
                        </span>
                      );
                    }
                    if (allStaffAvailability) {
                      return (
                        <Link
                          to={`/team/${member.id}?tab=availability`}
                          className="text-[9px] text-blue-500 leading-none active:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Set hours
                        </Link>
                      );
                    }
                    return null;
                  })()}
                </button>
              );
            })}
            {visibleStaff.length < COLS_PER_PAGE && (
              <div className="flex-1 border-l" />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Right overflow badge — shows count of staff hidden to the right */}
        {safeStaffPage < totalPages - 1 && (
          <button
            onClick={() => { setSwipeDir(1); setStaffPage(p => Math.min(totalPages - 1, p + 1)); }}
            className="flex-shrink-0 flex flex-col items-center justify-center gap-1 border-l px-1.5 active:bg-muted transition-colors"
            aria-label="Next staff"
          >
            <span className="text-[9px] font-extrabold text-primary leading-none">
              +{filteredStaff.length - (safeStaffPage + 1) * COLS_PER_PAGE}
            </span>
            <ChevronRight size={10} className="text-primary shrink-0" />
          </button>
        )}
      </div>
      )}

      {/* ── Scrollable grid (hidden in agenda view) ── */}
      {calView !== "agenda" && <div
        ref={gridRef}
        className="flex-1 overflow-y-auto"
        style={{ WebkitOverflowScrolling: "touch", userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex" style={{ height: totalGridH }}>

          {/* Time column */}
          <div
            className="flex-shrink-0 bg-card relative border-r border-border/40"
            style={{ width: TIME_COL_W }}
          >
            {/* Timeline pill — red outlined box */}
            {isToday && timeLinePosition !== null && (
              <div
                className="absolute z-20 pointer-events-none"
                style={{ top: timeLinePosition, transform: "translateY(-50%)", right: 0, left: 0 }}
              >
                <span
                  className="text-[10px] font-bold text-red-600 px-1 py-[3px] rounded leading-none block text-center"
                  style={{ border: "1.5px solid #dc2626", backgroundColor: "white" }}
                >
                  {timeLineLabel}
                </span>
              </div>
            )}

            {/* Time labels — large hour + minute sub-markers */}
            {Array.from({ length: TOTAL_HOURS * 4 + 1 }, (_, i) => {
              const totalMins = i * 15;
              const h = START_HOUR + Math.floor(totalMins / 60);
              const m = totalMins % 60;
              if (h > END_HOUR || (h === END_HOUR && m > 0)) return null;
              const isHour = m === 0;
              const topPx = (totalMins / 60) * HOUR_HEIGHT;
              const hMod = h % 24;
              const displayH = hMod === 0 ? 12 : hMod > 12 ? hMod - 12 : hMod;
              const ampmLabel = hMod >= 12 ? "PM" : "AM";
              if (isHour) {
                return (
                  <div key={`t-${h}-${m}`} className="absolute right-0 left-0 flex items-center justify-end pr-2 -translate-y-1/2" style={{ top: topPx }}>
                    <span className="text-[13px] font-extrabold text-indigo-600 leading-none tabular-nums whitespace-nowrap">
                      {displayH} {ampmLabel}
                    </span>
                  </div>
                );
              }
              return (
                <div key={`t-${h}-${m}`} className="absolute right-0 left-0 flex items-center justify-end pr-2 -translate-y-1/2" style={{ top: topPx }}>
                  <span className="text-[11px] font-medium text-slate-500 leading-none tabular-nums">
                    {m}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Staff columns — animated on page change */}
          <div className="flex-1 relative overflow-hidden">
            <AnimatePresence mode="wait" custom={swipeDir}>
              <motion.div
                key={`cols-${safeStaffPage}-${COLS_PER_PAGE}`}
                custom={swipeDir}
                initial={((dir: number) => ({ x: dir * 50, opacity: 0 })) as any}
                animate={{ x: 0, opacity: 1 }}
                exit={((dir: number) => ({ x: -dir * 50, opacity: 0 })) as any}
                transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="absolute inset-0 flex"
              >
                {visibleStaff.map((member: any) => {
                  const staffApts = getAppointmentsForStaff(member.id);
                  const color = getStaffColor(member);
                  return (
                    <StaffColumn
                      key={member.id}
                      member={member}
                      staffApts={staffApts}
                      staffColor={color}
                      totalGridH={totalGridH}
                      START_HOUR={START_HOUR}
                      END_HOUR={END_HOUR}
                      TOTAL_HOURS={TOTAL_HOURS}
                      HOUR_HEIGHT={HOUR_HEIGHT}
                      timeSlots={timeSlots}
                      settings={settings}
                      isToday={isToday}
                      timeLinePosition={timeLinePosition}
                      selectedSlot={selectedSlot}
                      selectedAppointment={selectedAppointment}
                      lateGracePeriodMinutes={lateGracePeriodMinutes}
                      showPrices={showPrices}
                      timezone={timezone}
                      getAppointmentStyle={getAppointmentStyle}
                      onSelectAppointment={onSelectAppointment}
                      onLongPressAppointment={(apt) => setQuickActionApt(apt)}
                      handleSlotClick={handleSlotClick}
                      handleBookSlot={handleBookSlot}
                       storeNow={storeNow}
                       isPastDate={isPastDate}
                      businessStartMin={businessStartMin}
                      businessEndMin={businessEndMin}
                      businessIsClosed={businessIsClosed}
                      currentDate={currentDate}
                      isStaffUser={isStaffUser}
                    />
                  );
                })}
                {visibleStaff.length < COLS_PER_PAGE && (
                  <div className="flex-1 bg-slate-50/40" />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

        </div>
      </div>}

      {/* ── Slot tap modal ── */}
      {selectedSlot && (
        <SlotModal
          slot={selectedSlot}
          staffName={filteredStaff.find((s) => s.id === selectedSlot.staffId)?.name || ""}
          onClose={() => setSelectedSlot(null)}
          onBook={() => {
            handleBookSlot(selectedSlot.staffId, selectedSlot.hour, selectedSlot.minute);
            setSelectedSlot(null);
          }}
        />
      )}

      {/* ── Quick action menu (long-press on appointment) ── */}
      {quickActionApt && (
        <QuickActionMenu
          apt={quickActionApt}
          onClose={() => setQuickActionApt(null)}
          onStart={() => { onQuickStart(quickActionApt); setQuickActionApt(null); }}
          onComplete={() => { onQuickComplete(quickActionApt); setQuickActionApt(null); }}
          onCancel={() => { onQuickCancel(quickActionApt); setQuickActionApt(null); }}
          onViewDetails={() => { onSelectAppointment(quickActionApt); setQuickActionApt(null); }}
        />
      )}

      {/* ── Now pill — right-aligned ── */}
      {showJumpToNow && (
        <button
          onClick={scrollToNow}
          className="fixed z-50 right-4 flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-blue-600 text-white text-sm font-bold shadow-xl active:bg-blue-700 active:scale-95 transition-all"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 68px)" }}
          data-testid="button-jump-to-now"
        >
          <Clock className="w-4 h-4" />
          Now
        </button>
      )}

      {/* ── FAB — hidden in staff portal; shown for owner calendar only ── */}
      {!isStaffUser && (
        <>
          <button
            className="fixed z-40 flex items-center justify-center rounded-full shadow-2xl active:scale-95 transition-transform duration-100"
            style={{
              bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
              left: "50%",
              transform: "translateX(-50%)",
              width: 56,
              height: 56,
              backgroundColor: "#0f172a",
            }}
            onClick={() => setShowFabMenu(true)}
            data-testid="mobile-fab-new-appointment"
            aria-label="New appointment"
          >
            <Plus className="w-6 h-6 text-white" />
          </button>

          {showFabMenu && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center px-6"
              onClick={() => setShowFabMenu(false)}
            >
              <div className="absolute inset-0 bg-black/40" />
              <div
                className="relative z-10 w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-card rounded-2xl shadow-2xl border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/40">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Appointment</p>
                  </div>
                  <div className="p-3 flex flex-col gap-2">
                    <button
                      className="w-full min-h-[56px] px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold active:opacity-80 transition-opacity flex items-center justify-center gap-2"
                      onClick={() => { setShowFabMenu(false); onNewBooking(); }}
                      data-testid="button-create-new-appointment"
                    >
                      <CalendarPlus className="w-4 h-4 shrink-0" />
                      <span>BOOK</span>
                    </button>
                    <button
                      className="w-full min-h-[56px] px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold active:opacity-80 transition-opacity flex items-center justify-center gap-2"
                      onClick={() => { setShowFabMenu(false); onLookup(); }}
                      data-testid="button-lookup-appointment"
                    >
                      <Search className="w-4 h-4 shrink-0" />
                      <span>LOOK UP</span>
                    </button>
                    <button
                      className="w-full min-h-[56px] px-4 py-3 rounded-xl border border-border text-sm font-semibold text-foreground active:bg-muted transition-colors flex items-center justify-center"
                      onClick={() => setShowFabMenu(false)}
                      data-testid="button-cancel-new-appointment-menu"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── StaffColumn sub-component ─── */
function StaffColumn({
  member,
  staffApts,
  staffColor,
  totalGridH,
  START_HOUR,
  END_HOUR,
  TOTAL_HOURS,
  HOUR_HEIGHT,
  timeSlots,
  settings,
  isToday,
  timeLinePosition,
  selectedSlot,
  selectedAppointment,
  lateGracePeriodMinutes,
  showPrices,
  timezone,
  getAppointmentStyle,
  onSelectAppointment,
  onLongPressAppointment,
  handleSlotClick,
  handleBookSlot,
  storeNow,
  isPastDate,
  businessStartMin,
  businessEndMin,
  businessIsClosed,
  currentDate,
  isStaffUser,
}: {
  member: any;
  staffApts: any[];
  staffColor: string;
  totalGridH: number;
  START_HOUR: number;
  END_HOUR: number;
  TOTAL_HOURS: number;
  HOUR_HEIGHT: number;
  timeSlots: { hour: number; minute: number; label: string; isHour: boolean }[];
  settings: { timeSlotInterval: number };
  isToday: boolean;
  timeLinePosition: number | null;
  selectedSlot: { staffId: number; hour: number; minute: number } | null;
  selectedAppointment: any | null;
  lateGracePeriodMinutes: number;
  showPrices: boolean;
  timezone: string;
  getAppointmentStyle: (apt: any) => { top: string; height: string };
  onSelectAppointment: (apt: any) => void;
  onLongPressAppointment: (apt: any) => void;
  handleSlotClick: (staffId: number, hour: number, minute: number) => void;
  handleBookSlot: (staffId: number, hour: number, minute: number) => void;
  storeNow: Date;
  isPastDate: boolean;
  businessStartMin: number;
  businessEndMin: number;
  businessIsClosed: boolean;
  currentDate: Date;
  isStaffUser: boolean;
}) {
  const slotLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slotLongPressFiredRef = useRef(false);
  const slotTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  const aptLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aptLongPressFiredRef = useRef(false);
  const aptTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const { syncMap, conflictMap } = usePendingSyncMap();

  return (
    <div
      className="flex-1 relative select-none bg-white"
      style={{
        height: totalGridH,
        borderLeft: `3px solid ${staffColor}`,
        WebkitUserSelect: "none",
        userSelect: "none",
      } as React.CSSProperties}
    >
      {/* Grid lines — hour lines solid/visible, half-hour dashed */}
      {Array.from({ length: TOTAL_HOURS * 4 + 1 }, (_, i) => {
        const totalMins = i * 15;
        const h = START_HOUR + Math.floor(totalMins / 60);
        const m = totalMins % 60;
        if (h > END_HOUR || (h === END_HOUR && m > 0)) return null;
        if (m !== 0 && m !== 30) return null;
        const topPx = (totalMins / 60) * HOUR_HEIGHT;
        return (
          <div
            key={`g-${h}-${m}`}
            className="absolute left-0 right-0 pointer-events-none"
            style={{
              top: topPx,
              borderTop: m === 0
                ? "1.5px solid rgba(0,0,0,0.22)"
                : "1px dashed rgba(0,0,0,0.18)",
            }}
          />
        );
      })}

      {/* Quarter-hour guides (very faint) */}
      {Array.from({ length: TOTAL_HOURS * 4 + 1 }, (_, i) => {
        const totalMins = i * 15;
        const h = START_HOUR + Math.floor(totalMins / 60);
        const m = totalMins % 60;
        if (h > END_HOUR || (h === END_HOUR && m > 0)) return null;
        if (m === 0 || m === 30) return null;
        const topPx = (totalMins / 60) * HOUR_HEIGHT;
        return (
          <div
            key={`q-${h}-${m}`}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: topPx, borderTop: "1px dotted rgba(0,0,0,0.08)" }}
          />
        );
      })}

      {/* Current time line — red */}
      {isToday && timeLinePosition !== null && (
        <div
          className="absolute left-0 right-0 z-10 pointer-events-none"
          style={{ top: timeLinePosition, height: 2, backgroundColor: "#dc2626" }}
        />
      )}

      {/* Tappable slots — tap = select, long-press = immediately book */}
      {timeSlots.map((slot) => {
        const topPx = ((slot.hour - START_HOUR) + slot.minute / 60) * HOUR_HEIGHT;
        const slotH = (settings.timeSlotInterval / 60) * HOUR_HEIGHT;
        const isSlotSel = selectedSlot?.staffId === member.id && selectedSlot?.hour === slot.hour && selectedSlot?.minute === slot.minute;

        const isPast = isStaffUser
          ? isPastDate || !isStaffSlotBookable(
              currentDate,
              slot.hour,
              slot.minute,
              storeNow,
            )
          : isPastDate || (isToday && new Date(Date.UTC(
              storeNow.getUTCFullYear(),
              storeNow.getUTCMonth(),
              storeNow.getUTCDate(),
              slot.hour,
              slot.minute,
              0,
            )).getTime() <= storeNow.getTime());
        const mobileSlotMin = slot.hour * 60 + slot.minute;
        const isNonWorking = businessIsClosed || mobileSlotMin < businessStartMin || mobileSlotMin >= businessEndMin;

        return (
          <div
            key={`s-${slot.hour}-${slot.minute}`}
            className={cn(
              "absolute left-0 right-0 transition-colors",
              isNonWorking ? "cursor-default" : isPast ? "cursor-default" : "cursor-pointer active:bg-primary/10",
              isSlotSel && !isNonWorking ? "bg-blue-100/70" : ""
            )}
            style={{
              top: topPx,
              height: slotH,
              WebkitTouchCallout: "none",
              backgroundColor: isNonWorking ? 'var(--cal-nonworking)' : undefined,
              backgroundImage: isNonWorking ? 'radial-gradient(rgba(148,163,184,0.32) 1px, transparent 1.3px)' : undefined,
              backgroundSize: isNonWorking ? '9px 9px' : undefined,
            } as React.CSSProperties}
            onContextMenu={(e) => e.preventDefault()}
            onTouchStart={(e) => {
              if (isPast || isNonWorking) return;
              const t = e.touches[0];
              slotTouchStartRef.current = { x: t.clientX, y: t.clientY };
              slotLongPressFiredRef.current = false;
              slotLongPressTimerRef.current = setTimeout(() => {
                slotLongPressFiredRef.current = true;
                handleBookSlot(member.id, slot.hour, slot.minute);
              }, 550);
            }}
            onTouchMove={(e) => {
              if (!slotTouchStartRef.current) return;
              const t = e.touches[0];
              const dx = Math.abs(t.clientX - slotTouchStartRef.current.x);
              const dy = Math.abs(t.clientY - slotTouchStartRef.current.y);
              if ((dx > 8 || dy > 8) && slotLongPressTimerRef.current) {
                clearTimeout(slotLongPressTimerRef.current);
                slotLongPressTimerRef.current = null;
              }
            }}
            onTouchEnd={(e) => {
              if (slotLongPressTimerRef.current) {
                clearTimeout(slotLongPressTimerRef.current);
                slotLongPressTimerRef.current = null;
              }
              if (slotLongPressFiredRef.current) return;
              if (!slotTouchStartRef.current) return;
              const t = e.changedTouches[0];
              const dx = Math.abs(t.clientX - slotTouchStartRef.current.x);
              const dy = Math.abs(t.clientY - slotTouchStartRef.current.y);
              if (dx > 8 || dy > 8) return;
              e.stopPropagation();
              handleSlotClick(member.id, slot.hour, slot.minute);
            }}
            onClick={(e) => {
              if (isPast || isNonWorking) return;
              e.stopPropagation();
              handleSlotClick(member.id, slot.hour, slot.minute);
            }}
          />
        );
      })}

      {/* Appointment blocks */}
      {staffApts.map((apt: any) => {
        const style = getAppointmentStyle(apt);
        const startTime = formatInTz(apt.date, timezone, "h:mm");
        const endTime = formatInTz(addMinutes(new Date(apt.date), apt.duration), timezone, "h:mm");
        const customerDisplayName = apt.customer?.fullName || apt.customer?.name || apt.customerName || apt.clientName || "Walk-In";
        const isSelected = selectedAppointment?.id === apt.id;
        const isOnlineBooking = apt.source === "online";

        const aptMinsElapsed = Math.floor((Date.now() - new Date(apt.date).getTime()) / 60000);
        const isOverdue = aptMinsElapsed >= lateGracePeriodMinutes && (apt.status === "pending" || apt.status === "confirmed");

        const bandColor =
          isOverdue ? "#dc2626"
          : apt.status === "completed" ? "#9ca3af"
          : apt.status === "started" ? "#16a34a"
          : apt.status === "late" ? "#ea580c"
          : apt.status === "no_show" ? "#e11d48"
          : staffColor;

        const aptAddons = apt.appointmentAddons?.map((aa: any) => aa.addon).filter(Boolean) || [];
        const serviceTotal = Number(apt.service?.price || 0) + aptAddons.reduce((s: number, a: any) => s + Number(a.price), 0);
        const isPaid = apt.status === "completed" && apt.paymentMethod;
        const isConfirmed = apt.status === "confirmed" || isOnlineBooking;

        const cardBg = isOverdue ? "#fef2f2" : apt.status === "completed" ? "#f9fafb" : staffColor + "18";
        const canQuickAction = apt.status !== "cancelled" && apt.status !== "completed" && apt.status !== "no_show";

        return (
          <div
            key={apt.id}
            className={cn(
              "absolute left-[2px] right-[2px] rounded-lg overflow-hidden z-[5] flex select-none",
              isSelected ? "ring-2 ring-offset-0" : "",
              apt.status === "completed" && "opacity-70"
            )}
            style={{
              ...style,
              backgroundColor: cardBg,
              borderLeft: `3px solid ${bandColor}`,
              border: `1px solid ${bandColor}35`,
              borderLeftWidth: 3,
              borderLeftColor: bandColor,
              ...(isSelected ? { boxShadow: `0 0 0 2px ${bandColor}` } : {}),
              WebkitTouchCallout: "none",
              cursor: "pointer",
            } as React.CSSProperties}
            onContextMenu={(e) => e.preventDefault()}
            onTouchStart={(e) => {
              const t = e.touches[0];
              aptTouchStartRef.current = { x: t.clientX, y: t.clientY };
              aptLongPressFiredRef.current = false;
              if (canQuickAction) {
                aptLongPressTimerRef.current = setTimeout(() => {
                  aptLongPressFiredRef.current = true;
                  onLongPressAppointment(apt);
                }, 500);
              }
            }}
            onTouchMove={(e) => {
              if (!aptTouchStartRef.current) return;
              const t = e.touches[0];
              const dx = Math.abs(t.clientX - aptTouchStartRef.current.x);
              const dy = Math.abs(t.clientY - aptTouchStartRef.current.y);
              if ((dx > 8 || dy > 8) && aptLongPressTimerRef.current) {
                clearTimeout(aptLongPressTimerRef.current);
                aptLongPressTimerRef.current = null;
              }
            }}
            onTouchEnd={(e) => {
              if (aptLongPressTimerRef.current) {
                clearTimeout(aptLongPressTimerRef.current);
                aptLongPressTimerRef.current = null;
              }
              if (aptLongPressFiredRef.current) {
                e.stopPropagation();
                return;
              }
              e.stopPropagation();
              onSelectAppointment(apt);
            }}
            onClick={(e) => { e.stopPropagation(); onSelectAppointment(apt); }}
            data-testid={`mobile-appt-block-${apt.id}`}
          >
            <div className="flex-1 px-1.5 py-1 min-w-0 overflow-hidden flex flex-col gap-0">
              {/* Time range */}
              <p className="text-[9px] text-gray-500 leading-none tabular-nums shrink-0">
                {startTime}–{endTime}
              </p>

              {/* Status chip — only for non-default statuses */}
              {(() => {
                const s = apt.status;
                if (!s || s === "confirmed") return null;
                const chip: Record<string, { label: string; bg: string; color: string }> = {
                  pending:   { label: "PENDING",   bg: "#fef9c3", color: "#a16207" },
                  completed: { label: "DONE",      bg: "#e5e7eb", color: "#374151" },
                  started:   { label: "IN PROG",   bg: "#bbf7d0", color: "#15803d" },
                  finished:  { label: "CHECKOUT",  bg: "#ffedd5", color: "#c2410c" },
                  late:      { label: "LATE",      bg: "#fef3c7", color: "#b45309" },
                  no_show:   { label: "NO SHOW",   bg: "#fee2e2", color: "#b91c1c" },
                  cancelled: { label: "CANCELLED", bg: "#fce7f3", color: "#be185d" },
                };
                const c = chip[s];
                if (!c) return null;
                return (
                  <span
                    className="shrink-0 self-start text-[7px] font-extrabold tracking-widest uppercase rounded px-1 py-[2px] leading-none mt-0.5"
                    style={{ background: c.bg, color: c.color }}
                  >
                    {c.label}
                  </span>
                );
              })()}

              {/* Client name — prominent */}
              <p className="text-[11px] font-bold leading-tight mt-0.5 truncate shrink-0" style={{ color: "#0f172a" }}>
                {customerDisplayName}
              </p>

              {/* Service name */}
              {apt.service?.name && (
                <p className="text-[10px] font-medium leading-tight truncate shrink-0 text-slate-600">
                  {apt.service.name}
                </p>
              )}

              {/* Add-ons */}
              {aptAddons.map((addon: any) => (
                <p key={addon.id} className="text-[9px] leading-tight truncate shrink-0 text-slate-400">
                  + {addon.name}
                </p>
              ))}

              {/* Duration · Price row */}
              {(apt.duration > 0 || (showPrices && serviceTotal > 0)) && (
                <div className="flex items-center gap-1.5 mt-0.5 shrink-0">
                  {apt.duration > 0 && (
                    <span className="text-[9px] text-slate-400 leading-none">{apt.duration}m</span>
                  )}
                  {showPrices && serviceTotal > 0 && (
                    <span className="text-[9px] font-semibold leading-none text-slate-600">
                      ${serviceTotal.toFixed(2)}{isPaid ? " ✓" : ""}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Right-side indicators */}
            <div className="flex-shrink-0 flex flex-col items-center justify-start gap-1 pr-1 pt-1">
              {apt.clientRequestedStaff && (
                <span className="text-[7px] font-extrabold text-amber-500 leading-none uppercase tracking-tight">REQ</span>
              )}
              {isConfirmed && (
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <Check className="w-2 h-2 text-white" strokeWidth={3} />
                </span>
              )}
              <AppointmentSyncBadge
                syncState={syncMap.get(apt._tempId) ?? (syncMap.get(`real:${apt.id}`) as any)}
                conflictDetail={conflictMap.get(apt._tempId) ?? conflictMap.get(`real:${apt.id}`)}
                entityTempId={apt._tempId}
                entityRealId={typeof apt.id === "number" ? apt.id : undefined}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Slot tap modal ─── */
function SlotModal({
  slot,
  staffName,
  onClose,
  onBook,
}: {
  slot: { staffId: number; hour: number; minute: number };
  staffName: string;
  onClose: () => void;
  onBook: () => void;
}) {
  const h = slot.hour > 12 ? slot.hour - 12 : slot.hour === 0 ? 12 : slot.hour;
  const m = String(slot.minute).padStart(2, "0");
  const ampm = slot.hour >= 12 ? "PM" : "AM";

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center px-4"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 68px)" }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30" />
      <motion.div
        ref={sheetRef}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="relative z-10 bg-card rounded-2xl shadow-2xl border w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { dragStartY.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => {
          if (dragStartY.current === null) return;
          const dy = e.changedTouches[0].clientY - dragStartY.current;
          if (dy > 60) onClose();
          dragStartY.current = null;
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
          <div>
            <p className="text-sm font-bold">{h}:{m} {ampm}</p>
            {staffName && <p className="text-xs text-muted-foreground">{staffName}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-3 flex flex-col gap-2">
          <button
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:opacity-80 transition-opacity"
            onClick={onBook}
          >
            Create New Appointment
          </button>
          <button
            className="w-full py-3 rounded-xl border border-border text-sm font-medium text-foreground active:bg-muted transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Quick-action bottom sheet (long-press on appointment) ─── */
function QuickActionMenu({
  apt,
  onClose,
  onStart,
  onComplete,
  onCancel,
  onViewDetails,
}: {
  apt: any;
  onClose: () => void;
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onViewDetails: () => void;
}) {
  const dragStartY = useRef<number | null>(null);
  const customerName = apt.customer?.fullName || apt.customer?.name || apt.customerName || apt.clientName || "Walk-In";
  const serviceName = apt.service?.name || "Service";
  const canStart = apt.status === "pending" || apt.status === "confirmed";
  const canComplete = apt.status === "started";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <motion.div
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="relative z-10 w-full bg-card rounded-t-2xl shadow-2xl border-t"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { dragStartY.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => {
          if (dragStartY.current === null) return;
          const dy = e.changedTouches[0].clientY - dragStartY.current;
          if (dy > 60) onClose();
          dragStartY.current = null;
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 border-b">
          <p className="text-sm font-bold text-foreground truncate">{customerName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{serviceName}</p>
        </div>

        {/* Actions */}
        <div className="p-3 flex flex-col gap-2">
          {canStart && (
            <button
              className="w-full min-h-[54px] flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm active:opacity-80 transition-opacity"
              onClick={onStart}
            >
              <Play className="w-5 h-5 fill-white flex-shrink-0" />
              <span>Start Service</span>
            </button>
          )}
          {canComplete && (
            <button
              className="w-full min-h-[54px] flex items-center gap-3 px-4 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm active:opacity-80 transition-opacity"
              onClick={onComplete}
            >
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>Complete</span>
            </button>
          )}
          <button
            className="w-full min-h-[54px] flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-red-200 text-red-700 font-semibold text-sm active:bg-red-50 transition-colors"
            onClick={onCancel}
          >
            <XCircle className="w-5 h-5 flex-shrink-0" />
            <span>Cancel Appointment</span>
          </button>
          <button
            className="w-full min-h-[46px] flex items-center justify-center px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground active:bg-muted transition-colors"
            onClick={onViewDetails}
          >
            View Full Details
          </button>
        </div>
      </motion.div>
    </div>
  );
}
